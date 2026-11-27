import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { annotateHostProfiles } from './creator-profiles.mjs'
import { fetchText, extractAssignedJson, collectRenderers, parseSearchRenderer, enrichVideo } from './collect-youtube-public.mjs'
import { parseClockDuration, screenCandidate, stripMarkup } from './screening.mjs'
import { appendSnapshot, scoreBilibiliVideos } from './scoring.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = path.join(root, 'public/data/rankings.json')
const statePath = path.join(root, 'public/data/backfill-state.json')
const maxCreators = Number(process.env.BACKFILL_CREATORS_PER_PLATFORM || 4)
const maxDetails = Number(process.env.BACKFILL_DETAILS_PER_PLATFORM || 45)
const maxBiliPages = Number(process.env.BACKFILL_BILI_PAGES_PER_CREATOR || 3)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const count = (value) => Number(String(value || 0).replace(/[^\d]/g, '')) || 0

function walk(node, key, found = []) {
  if (!node || typeof node !== 'object') return found
  if (node[key]) found.push(node[key])
  for (const value of Object.values(node)) walk(value, key, found)
  return found
}

export function parseChannelVideos(initialData, creator) {
  const seen = new Set()
  const candidates = []
  for (const lockup of walk(initialData, 'lockupViewModel')) {
    if (lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !lockup.contentId || seen.has(lockup.contentId)) continue
    const thumbnail = lockup.contentImage?.thumbnailViewModel
    const badges = (thumbnail?.overlays || []).flatMap((overlay) => overlay.thumbnailBottomOverlayViewModel?.badges || [])
    const durationSeconds = parseClockDuration(badges[0]?.thumbnailBadgeViewModel?.text)
    if (durationSeconds < 180) continue
    seen.add(lockup.contentId)
    candidates.push({
      id: lockup.contentId,
      title: stripMarkup(lockup.metadata?.lockupMetadataViewModel?.title?.content),
      durationSeconds,
      thumbnail: thumbnail?.image?.sources?.at(-1)?.url || '',
      creatorId: creator.id,
      creatorName: creator.name,
      creatorUrl: creator.url,
    })
  }
  return candidates
}

function updateCreators(data, platform, descriptions = new Map()) {
  const previous = new Map((data.creators[platform] || []).map((creator) => [String(creator.id), creator]))
  const grouped = new Map()
  for (const video of data.videos[platform]) {
    const group = grouped.get(String(video.creatorId)) || { name: video.creatorName, categories: new Map(), count: 0 }
    group.count += 1
    for (const category of video.categories || []) group.categories.set(category, (group.categories.get(category) || 0) + 1)
    grouped.set(String(video.creatorId), group)
  }
  data.creators[platform] = [...grouped].map(([id, group]) => {
    const old = previous.get(id) || {}
    return {
      ...old, id, platform, name: old.name || group.name,
      url: old.url || (platform === 'youtube' ? `https://www.youtube.com/channel/${id}` : `https://space.bilibili.com/${id}`),
      description: descriptions.get(id) || old.description || '',
      followers: old.followers || 0, qualifyingVideos: group.count,
      topCategories: [...group.categories].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }
  }).sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}

async function collectYoutube(data, state) {
  const known = new Map(data.videos.youtube.map((video) => [video.id, video]))
  const descriptions = new Map()
  let creators = 0
  let details = 0
  let added = 0
  for (const creator of data.creators.youtube) {
    if (creators >= maxCreators || details >= maxDetails) break
    if (state.youtube.completed[creator.id]) continue
    creators += 1
    try {
      const base = `https://www.youtube.com/channel/${encodeURIComponent(creator.id)}`
      const paths = ['/videos', ...['ASMR sleep', 'ASMR no talking', 'ASMR whisper', 'ASMR ear cleaning'].map((query) => `/search?query=${encodeURIComponent(query)}`)]
      const candidateMap = new Map()
      for (const urlPath of paths) {
        try {
          const html = await fetchText(`${base}${urlPath}`, 1)
          const initial = extractAssignedJson(html, 'var ytInitialData = ') || extractAssignedJson(html, 'ytInitialData = ')
          if (!initial) throw new Error('page has no public video list')
          const description = initial.metadata?.channelMetadataRenderer?.description || ''
          if (description) descriptions.set(creator.id, description.slice(0, 3000))
          const items = [
            ...parseChannelVideos(initial, creator),
            ...collectRenderers(initial).map(parseSearchRenderer).filter((candidate) => candidate.id && candidate.durationSeconds >= 180)
              .map((candidate) => ({ ...candidate, creatorId: creator.id, creatorName: creator.name, creatorUrl: creator.url })),
          ]
          for (const candidate of items) candidateMap.set(candidate.id, candidate)
        } catch (error) {
          console.warn(`youtube ${creator.id}${urlPath}: ${String(error.message || error)}`)
        }
        await pause(600)
      }
      const candidates = [...candidateMap.values()]
      if (!candidates.length) throw new Error('channel page has no parseable video cards')
      let exhausted = true
      for (const candidate of candidates) {
        if (known.has(candidate.id) || state.youtube.checked[candidate.id]) continue
        if (details >= maxDetails) { exhausted = false; break }
        details += 1
        try {
          const video = await enrichVideo(candidate)
          state.youtube.checked[candidate.id] = true
          if (video.approved && video.creatorId === creator.id) {
            const { approved: _approved, followers: _followers, creatorUrl: _creatorUrl, ...record } = video
            known.set(video.id, record)
            added += 1
          }
        } catch (error) {
          console.warn(`youtube detail ${candidate.id}: ${String(error.message || error)}`)
        }
        await pause(300)
      }
      if (exhausted) state.youtube.completed[creator.id] = true
      console.log(`youtube channel ${creator.name}: ${candidates.length} visible cards, ${added} added total`)
    } catch (error) {
      console.warn(`youtube channel ${creator.id}: ${String(error.message || error)}`)
    }
    await pause(1000)
  }
  data.videos.youtube = [...known.values()].sort((a, b) => b.views - a.views)
  updateCreators(data, 'youtube', descriptions)
  return { creators, details, added }
}

async function biliJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://space.bilibili.com/' }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = await response.json()
  if (json.code !== 0) throw new Error(`Bilibili ${json.code}: ${json.message || 'unavailable'}`)
  return json.data
}

async function collectBilibili(data, state) {
  const known = new Map(data.videos.bilibili.map((video) => [video.id, video]))
  let creators = 0
  let details = 0
  let added = 0
  let limited = false
  for (const creator of data.creators.bilibili) {
    if (creators >= maxCreators || details >= maxDetails || limited) break
    const startPage = state.bilibili.nextPage[creator.id] || 1
    if (startPage < 0) continue
    creators += 1
    for (let page = startPage; page < startPage + maxBiliPages && details < maxDetails; page += 1) {
      try {
        const query = new URLSearchParams({ mid: creator.id, pn: String(page), ps: '30' })
        const listing = await biliJson(`https://api.bilibili.com/x/space/arc/search?${query}`)
        const items = listing.list?.vlist || []
        if (!items.length) { state.bilibili.nextPage[creator.id] = -1; break }
        for (const item of items) {
          if (!item.bvid || known.has(item.bvid) || details >= maxDetails) continue
          details += 1
          try {
            const result = await biliJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(item.bvid)}`)
            const screening = screenCandidate({ platform: 'bilibili', title: result.title, description: result.desc, durationSeconds: result.duration, creatorName: creator.name })
            if (screening.approved && String(result.owner?.mid) === String(creator.id)) {
              const video = {
                id: result.bvid, platform: 'bilibili', title: stripMarkup(result.title), description: stripMarkup(result.desc).slice(0, 240),
                url: `https://www.bilibili.com/video/${result.bvid}`, thumbnail: result.pic || '',
                creatorId: creator.id, creatorName: creator.name, publishedAt: new Date(result.pubdate * 1000).toISOString(),
                durationSeconds: result.duration, views: count(result.stat?.view), likes: count(result.stat?.like),
                favorites: count(result.stat?.favorite), comments: count(result.stat?.reply),
                categories: screening.categories, screeningConfidence: screening.confidence, screeningReasons: screening.reasons,
              }
              video.history = appendSnapshot(video, new Date().toISOString())
              known.set(video.id, video)
              added += 1
            }
          } catch (error) {
            if (/Bilibili -(?:799|412|352)|HTTP 429/.test(String(error.message))) { limited = true; break }
            console.warn(`bilibili detail ${item.bvid}: ${String(error.message || error)}`)
          }
          await pause(1200)
        }
        if (limited || details >= maxDetails) break
        state.bilibili.nextPage[creator.id] = items.length < 30 ? -1 : page + 1
        if (items.length < 30) break
        await pause(1800)
      } catch (error) {
        console.warn(`bilibili channel ${creator.id}: ${String(error.message || error)}`)
        if (/Bilibili -(?:799|412|352)|HTTP 429/.test(String(error.message))) limited = true
        break
      }
    }
  }
  data.videos.bilibili = scoreBilibiliVideos([...known.values()], Date.now())
  updateCreators(data, 'bilibili')
  return { creators, details, added, limited }
}

async function main() {
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'))
  let state = { youtube: { completed: {}, checked: {} }, bilibili: { nextPage: {} } }
  try { state = JSON.parse(await fs.readFile(statePath, 'utf8')) } catch {}
  state.youtube ||= { completed: {}, checked: {} }
  state.youtube.completed ||= {}
  state.youtube.checked ||= {}
  state.bilibili ||= { nextPage: {} }
  state.bilibili.nextPage ||= {}
  const youtube = await collectYoutube(data, state)
  const bilibili = await collectBilibili(data, state)
  if (youtube.added || bilibili.added) data.generatedAt = new Date().toISOString()
  annotateHostProfiles(data)
  await fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`)
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
  console.log(JSON.stringify({ youtube, bilibili, total: { youtube: data.videos.youtube.length, bilibili: data.videos.bilibili.length } }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
