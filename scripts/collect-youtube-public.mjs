import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseClockDuration, screenCandidate, stripMarkup } from './screening.mjs'
import { annotateHostProfiles } from './creator-profiles.mjs'

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(here, '../public/data/rankings.json')
const maxVideos = Number(process.env.MAX_YOUTUBE_VIDEOS || 120)
const libraryLimit = Number(process.env.LIBRARY_LIMIT_PER_PLATFORM || 240)
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const searchQueries = [
  'ASMR sleep',
  'ASMR no talking sleep',
  'ASMR whisper sleep',
  'ASMR tapping sleep',
  'ASMR ear cleaning sleep',
  'ASMR personal attention sleep',
  'ASMR deep sleep',
  'ASMR insomnia relief',
  'ASMR rain sounds sleep',
  'ASMR mic brushing sleep',
  'ASMR roleplay sleep',
  'ASMR personal attention bedtime',
  'ASMR soft spoken sleep',
  'ASMR ear to ear sleep',
  'ASMR white noise deep sleep',
  'ASMR triggers for sleep no talking',
]
const maxSearchQueries = Number(process.env.MAX_SEARCH_QUERIES || searchQueries.length)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchText(url, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (process.platform === 'win32') {
      try {
        const safeUrl = url.replace(/'/g, "''")
        const safeAgent = userAgent.replace(/'/g, "''")
        const command = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Invoke-WebRequest -UseBasicParsing -Uri '${safeUrl}' -Headers @{'User-Agent'='${safeAgent}';'Accept-Language'='en-US,en;q=0.9'} -TimeoutSec 45).Content`
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
          maxBuffer: 16 * 1024 * 1024,
          encoding: 'utf8',
        })
        if (stdout) return stdout
      } catch (powershellError) {
        lastError = powershellError
        if (attempt < attempts) await sleep(700 * attempt)
        continue
      }
    }
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent, 'accept-language': 'en-US,en;q=0.9' },
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.text()
    } catch (error) {
      lastError = error
      try {
        const { stdout } = await execFileAsync('curl', [
          '-L', '--fail', '--silent', '--show-error',
          '-A', userAgent,
          '-H', 'Accept-Language: en-US,en;q=0.9',
          url,
        ], { maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' })
        if (stdout) return stdout
      } catch (curlError) {
        lastError = curlError
      }
      if (attempt < attempts) await sleep(700 * attempt)
    }
  }
  throw lastError
}

function extractAssignedJson(html, marker) {
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return null
  const start = html.indexOf('{', markerIndex + marker.length)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(html.slice(start, index + 1))
    }
  }
  return null
}

function collectRenderers(node, output = []) {
  if (!node || typeof node !== 'object') return output
  if (node.videoRenderer) output.push(node.videoRenderer)
  for (const value of Object.values(node)) collectRenderers(value, output)
  return output
}

function textOf(node) {
  if (!node) return ''
  if (typeof node.simpleText === 'string') return node.simpleText
  return (node.runs || []).map((run) => run.text || '').join('')
}

function parseCount(value = '') {
  const normalized = String(value).replace(/,/g, '').trim().toLowerCase()
  const match = normalized.match(/([\d.]+)\s*([kmb]?)/)
  if (!match) return 0
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2]] || 1
  return Math.round(Number(match[1]) * multiplier)
}

function parseSearchRenderer(renderer) {
  const id = renderer.videoId
  const durationSeconds = parseClockDuration(textOf(renderer.lengthText))
  const creatorRun = renderer.ownerText?.runs?.[0] || renderer.shortBylineText?.runs?.[0] || {}
  const channelEndpoint = creatorRun.navigationEndpoint?.browseEndpoint || {}
  const thumbnailList = renderer.thumbnail?.thumbnails || []
  return {
    id,
    title: stripMarkup(textOf(renderer.title)),
    description: stripMarkup(textOf(renderer.detailedMetadataSnippets?.[0]?.snippetText)),
    durationSeconds,
    views: parseCount(textOf(renderer.viewCountText)),
    creatorName: stripMarkup(creatorRun.text),
    creatorId: channelEndpoint.browseId || stripMarkup(creatorRun.text).toLowerCase().replace(/\W+/g, '-'),
    creatorUrl: channelEndpoint.canonicalBaseUrl ? `https://www.youtube.com${channelEndpoint.canonicalBaseUrl}` : '',
    thumbnail: thumbnailList.at(-1)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  }
}

async function enrichVideo(candidate) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${candidate.id}`)
  const player = extractAssignedJson(html, 'var ytInitialPlayerResponse = ')
    || extractAssignedJson(html, 'ytInitialPlayerResponse = ')
  const details = player?.videoDetails || {}
  const micro = player?.microformat?.playerMicroformatRenderer || {}
  const likeMatch = html.match(/accessibilityText":"like this video along with ([\d,]+) other people"/i)
  const subscriberMatch = html.match(/"subscriberCountText":\{.*?"simpleText":"([^"]+)"/s)
  const channelId = details.channelId || candidate.creatorId
  const description = stripMarkup(details.shortDescription || candidate.description).slice(0, 260)
  const screening = screenCandidate({
    title: details.title || candidate.title,
    description,
    tags: details.keywords || '',
    durationSeconds: Number(details.lengthSeconds || candidate.durationSeconds),
    creatorName: details.author || candidate.creatorName,
  })

  return {
    id: candidate.id,
    platform: 'youtube',
    title: stripMarkup(details.title || candidate.title),
    description,
    url: `https://www.youtube.com/watch?v=${candidate.id}`,
    thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || candidate.thumbnail,
    creatorId: channelId,
    creatorName: stripMarkup(details.author || candidate.creatorName),
    creatorUrl: candidate.creatorUrl || `https://www.youtube.com/channel/${channelId}`,
    publishedAt: micro.publishDate || micro.uploadDate || new Date().toISOString(),
    durationSeconds: Number(details.lengthSeconds || candidate.durationSeconds),
    views: Number(details.viewCount || candidate.views || 0),
    likes: likeMatch ? Number(likeMatch[1].replace(/,/g, '')) : 0,
    comments: 0,
    followers: subscriberMatch ? parseCount(subscriberMatch[1]) : 0,
    categories: screening.categories,
    screeningConfidence: screening.confidence,
    screeningReasons: screening.reasons,
    approved: screening.approved,
  }
}

function creatorsFrom(videos) {
  const creators = new Map()
  for (const video of videos) {
    const current = creators.get(video.creatorId) || {
      id: video.creatorId,
      platform: 'youtube',
      name: video.creatorName,
      url: video.creatorUrl,
      followers: video.followers,
      qualifyingVideos: 0,
      categoryCounts: new Map(),
    }
    current.followers = Math.max(current.followers, video.followers)
    current.qualifyingVideos += 1
    for (const category of video.categories) current.categoryCounts.set(category, (current.categoryCounts.get(category) || 0) + 1)
    creators.set(video.creatorId, current)
  }
  return [...creators.values()]
    .map(({ categoryCounts, ...creator }) => ({
      ...creator,
      topCategories: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }))
    .sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}

function mergeVideos(previousVideos = [], freshVideos = []) {
  const videos = new Map()
  for (const video of previousVideos) {
    const screening = screenCandidate({
      title: video.title,
      description: video.description,
      tags: video.categories,
      durationSeconds: video.durationSeconds,
      creatorName: video.creatorName,
    })
    if (screening.approved && video.durationSeconds >= 180) videos.set(video.id, video)
  }
  for (const video of freshVideos) videos.set(video.id, { ...videos.get(video.id), ...video })
  return [...videos.values()].sort((a, b) => b.views - a.views).slice(0, libraryLimit)
}

function creatorsForLibrary(videos, previousCreators = [], freshCreators = []) {
  const metadata = new Map()
  for (const creator of [...previousCreators, ...freshCreators]) {
    const current = metadata.get(creator.id)
    metadata.set(creator.id, {
      ...current,
      ...creator,
      followers: Math.max(current?.followers || 0, creator.followers || 0),
      avatar: creator.avatar || current?.avatar,
    })
  }
  const grouped = new Map()
  for (const video of videos) {
    const current = grouped.get(video.creatorId) || { count: 0, categories: new Map(), name: video.creatorName }
    current.count += 1
    for (const category of video.categories) current.categories.set(category, (current.categories.get(category) || 0) + 1)
    grouped.set(video.creatorId, current)
  }
  return [...grouped.entries()].map(([id, group]) => {
    const meta = metadata.get(id) || {}
    return {
      id,
      platform: 'youtube',
      name: meta.name || group.name,
      url: meta.url || `https://www.youtube.com/channel/${id}`,
      avatar: meta.avatar || '',
      followers: meta.followers || 0,
      qualifyingVideos: group.count,
      topCategories: [...group.categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }
  }).sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}

async function main() {
  const candidates = new Map()
  for (const query of searchQueries.slice(0, maxSearchQueries)) {
    const html = await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`)
    const initialData = extractAssignedJson(html, 'var ytInitialData = ')
      || extractAssignedJson(html, 'ytInitialData = ')
    if (!initialData) throw new Error(`无法解析 YouTube 搜索结果：${query}`)
    for (const renderer of collectRenderers(initialData)) {
      const candidate = parseSearchRenderer(renderer)
      if (candidate.id && candidate.durationSeconds >= 180 && !candidates.has(candidate.id)) candidates.set(candidate.id, candidate)
    }
    console.log(`search: ${query} (${candidates.size} unique)`)
    await sleep(280)
  }

  const candidateList = [...candidates.values()].slice(0, Math.max(maxVideos * 2, 72))
  const enriched = []
  let rejectionSamples = 0
  for (let index = 0; index < candidateList.length && enriched.length < maxVideos; index += 4) {
    const batch = candidateList.slice(index, index + 4)
    const results = await Promise.allSettled(batch.map(enrichVideo))
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.approved) enriched.push(result.value)
      else if (result.status === 'fulfilled' && rejectionSamples < 6) {
        console.log(`rejected: ${result.value.title} | ${result.value.durationSeconds}s | ${result.value.screeningReasons.join(', ')}`)
        rejectionSamples += 1
      } else if (result.status === 'rejected' && rejectionSamples < 6) {
        console.log(`detail error: ${String(result.reason?.message || result.reason)}`)
        rejectionSamples += 1
      }
    }
    console.log(`details: ${Math.min(index + 4, candidateList.length)}/${candidateList.length}, approved ${enriched.length}`)
    await sleep(220)
  }

  const freshVideos = enriched
    .sort((a, b) => b.views - a.views)
    .slice(0, maxVideos)
    .map(({ approved: _approved, followers: _followers, creatorUrl: _creatorUrl, ...video }) => video)
  const data = JSON.parse(await fs.readFile(outputPath, 'utf8'))
  const freshCreators = creatorsFrom(enriched.slice(0, maxVideos))
  const videos = mergeVideos(data.videos?.youtube, freshVideos)
  const updatedAt = new Date().toISOString()
  data.generatedAt = updatedAt
  data.sources.youtube = { status: 'live', updatedAt, note: `公开页面无密钥采集；本次新增/更新 ${freshVideos.length} 条` }
  data.videos.youtube = videos
  data.creators.youtube = creatorsForLibrary(videos, data.creators?.youtube, freshCreators)
  await fs.writeFile(outputPath, `${JSON.stringify(annotateHostProfiles(data), null, 2)}\n`, 'utf8')
  console.log(`youtube: ${videos.length} videos, ${data.creators.youtube.length} creators`)
}

await main()
