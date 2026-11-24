import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hardRejectReasons, parseClockDuration, parseIsoDuration, screenCandidate, stripMarkup } from './screening.mjs'
import { appendSnapshot, scoreBilibiliVideos } from './scoring.mjs'
import { annotateHostProfiles } from './creator-profiles.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(here, '../public/data/rankings.json')
const lookbackDays = Number(process.env.LOOKBACK_DAYS || 3650)
const maxVideos = Number(process.env.MAX_VIDEOS_PER_PLATFORM || 120)
const libraryLimit = Number(process.env.LIBRARY_LIMIT_PER_PLATFORM || 240)
const cutoff = Date.now() - lookbackDays * 86400000

const queries = {
  youtube: ['ASMR sleep', 'ASMR no talking sleep', 'ASMR whisper sleep', 'ASMR tapping sleep', 'ASMR ear cleaning sleep'],
  bilibili: [
    'ASMR 助眠', 'ASMR 无人声助眠', 'ASMR 耳语助眠', 'ASMR 轻语入睡',
    'ASMR 掏耳助眠', 'ASMR 敲击音助眠', 'ASMR 白噪音睡眠', 'ASMR 角色扮演助眠',
    'ASMR 刷麦助眠', 'ASMR 触发音睡眠', 'ASMR 雨声睡眠', 'ASMR 深度睡眠',
  ],
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const number = (value) => Number.parseInt(value || '0', 10) || 0
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))

async function fetchJson(url, options = {}, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
          accept: 'application/json',
          ...(options.headers || {}),
        },
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const json = await response.json()
      if (json?.code && json.code !== 0) throw new Error(`API code ${json.code}: ${json.message || 'unknown'}`)
      return json
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(500 * 2 ** attempt)
    }
  }
  throw lastError
}

async function collectYouTube() {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('未配置 YOUTUBE_API_KEY')
  const ids = new Set()
  const publishedAfter = new Date(cutoff).toISOString()

  for (const query of queries.youtube) {
    const params = new URLSearchParams({
      key,
      part: 'snippet',
      type: 'video',
      maxResults: '25',
      order: 'viewCount',
      q: `${query} -reaction -review -challenge -meme -shorts`,
      videoDuration: 'long',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      publishedAfter,
    })
    const data = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`)
    for (const item of data.items || []) if (item.id?.videoId) ids.add(item.id.videoId)
  }

  const details = []
  for (const idChunk of chunks([...ids], 50)) {
    const params = new URLSearchParams({ key, part: 'snippet,contentDetails,statistics,status', id: idChunk.join(',') })
    const data = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${params}`)
    details.push(...(data.items || []))
  }

  const channelIds = [...new Set(details.map((item) => item.snippet?.channelId).filter(Boolean))]
  const channels = new Map()
  for (const channelChunk of chunks(channelIds, 50)) {
    const params = new URLSearchParams({ key, part: 'snippet,statistics', id: channelChunk.join(',') })
    const data = await fetchJson(`https://www.googleapis.com/youtube/v3/channels?${params}`)
    for (const channel of data.items || []) channels.set(channel.id, channel)
  }

  const videos = details
    .filter((item) => item.status?.embeddable !== false && new Date(item.snippet?.publishedAt).getTime() >= cutoff)
    .map((item) => {
      const durationSeconds = parseIsoDuration(item.contentDetails?.duration)
      const channel = channels.get(item.snippet?.channelId)
      const screening = screenCandidate({
        title: item.snippet?.title,
        description: item.snippet?.description,
        tags: item.snippet?.tags,
        durationSeconds,
        creatorName: item.snippet?.channelTitle || channel?.snippet?.title,
      })
      return {
        id: item.id,
        platform: 'youtube',
        title: stripMarkup(item.snippet?.title),
        description: stripMarkup(item.snippet?.description).slice(0, 240),
        url: `https://www.youtube.com/watch?v=${item.id}`,
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
        creatorId: item.snippet?.channelId,
        creatorName: item.snippet?.channelTitle || channel?.snippet?.title || 'Unknown',
        creatorAvatar: channel?.snippet?.thumbnails?.default?.url || '',
        publishedAt: item.snippet?.publishedAt,
        durationSeconds,
        views: number(item.statistics?.viewCount),
        likes: number(item.statistics?.likeCount),
        comments: number(item.statistics?.commentCount),
        categories: screening.categories,
        screeningConfidence: screening.confidence,
        screeningReasons: screening.reasons,
        approved: screening.approved,
        followers: number(channel?.statistics?.subscriberCount),
      }
    })
    .filter((item) => item.approved)
    .sort((a, b) => b.views - a.views)
    .slice(0, maxVideos)

  return finalize(videos, channels, 'youtube')
}

async function collectBilibili() {
  const candidates = new Map()
  for (const query of queries.bilibili) {
    for (const order of ['click', 'pubdate']) {
      const params = new URLSearchParams({ search_type: 'video', keyword: query, page: '1', page_size: '30', order })
      const data = await fetchJson(`https://api.bilibili.com/x/web-interface/wbi/search/type?${params}`, {
        headers: { referer: 'https://search.bilibili.com/' },
      })
      for (const item of data.data?.result || []) if (item.bvid) candidates.set(item.bvid, item)
      await sleep(450)
    }
  }

  const approvedPool = [...candidates.values()]
    .map((item) => {
      const durationSeconds = parseClockDuration(item.duration)
      const screening = screenCandidate({
        platform: 'bilibili',
        title: item.title,
        description: item.description,
        tags: item.tag,
        durationSeconds,
        creatorName: item.author,
      })
      return {
        id: item.bvid,
        platform: 'bilibili',
        title: stripMarkup(item.title),
        description: stripMarkup(item.description).slice(0, 240),
        url: `https://www.bilibili.com/video/${item.bvid}`,
        thumbnail: item.pic ? `https:${item.pic}`.replace('https:https:', 'https:') : '',
        creatorId: String(item.mid),
        creatorName: stripMarkup(item.author),
        creatorAvatar: item.upic || '',
        publishedAt: new Date(number(item.pubdate) * 1000).toISOString(),
        durationSeconds,
        views: number(item.play),
        likes: number(item.like),
        favorites: number(item.favorites || item.favorite),
        comments: number(item.review),
        categories: screening.categories,
        screeningConfidence: screening.confidence,
        screeningReasons: screening.reasons,
        approved: screening.approved,
        followers: 0,
      }
    })
    .filter((item) => item.approved && new Date(item.publishedAt).getTime() >= cutoff)

  const popularCount = Math.ceil(maxVideos * 0.67)
  const popular = [...approvedPool].sort((a, b) => b.views - a.views).slice(0, popularCount)
  const selectedIds = new Set(popular.map((item) => item.id))
  const recent = [...approvedPool]
    .filter((item) => !selectedIds.has(item.id))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, maxVideos - popular.length)
  const approved = [...popular, ...recent]

  const followerMap = new Map()
  for (const mid of [...new Set(approved.map((item) => item.creatorId))]) {
    try {
      const data = await fetchJson(`https://api.bilibili.com/x/relation/stat?vmid=${encodeURIComponent(mid)}`, {
        headers: { referer: `https://space.bilibili.com/${mid}` },
      })
      followerMap.set(mid, number(data.data?.follower))
    } catch {
      followerMap.set(mid, 0)
    }
    await sleep(180)
  }
  for (const video of approved) video.followers = followerMap.get(video.creatorId) || 0
  return finalize(approved, new Map(), 'bilibili')
}

function finalize(rawVideos, _channels, platform) {
  const creatorMap = new Map()
  for (const video of rawVideos) {
    const current = creatorMap.get(video.creatorId) || {
      id: video.creatorId,
      platform,
      name: video.creatorName,
      url: platform === 'youtube'
        ? `https://www.youtube.com/channel/${video.creatorId}`
        : `https://space.bilibili.com/${video.creatorId}`,
      avatar: video.creatorAvatar,
      followers: video.followers,
      qualifyingVideos: 0,
      categoryCounts: new Map(),
    }
    current.followers = Math.max(current.followers, video.followers)
    current.qualifyingVideos += 1
    for (const category of video.categories) current.categoryCounts.set(category, (current.categoryCounts.get(category) || 0) + 1)
    creatorMap.set(video.creatorId, current)
  }

  const creators = [...creatorMap.values()]
    .map(({ categoryCounts, ...creator }) => ({
      ...creator,
      topCategories: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }))
    .sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)

  const videos = rawVideos.map(({ approved: _approved, followers: _followers, ...video }) => video)
  return { videos, creators }
}

function candidateStillQualifies(video) {
  return hardRejectReasons({
    title: video.title,
    tags: video.categories,
    durationSeconds: video.durationSeconds,
    creatorName: video.creatorName,
  }).length === 0
}

function mergeVideos(previousVideos = [], freshVideos = [], platform, capturedAt) {
  const byId = new Map()
  for (const video of previousVideos) {
    if (video.durationSeconds >= 180 && candidateStillQualifies(video)) byId.set(video.id, video)
  }
  const freshIds = new Set()
  for (const video of freshVideos) {
    freshIds.add(video.id)
    const previous = byId.get(video.id)
    byId.set(video.id, {
      ...previous,
      ...video,
      favorites: Number(video.favorites || 0) > 0 ? video.favorites : previous?.favorites,
      history: previous?.history || video.history,
      scores: previous?.scores,
    })
  }
  let videos = [...byId.values()].sort((a, b) => b.views - a.views).slice(0, libraryLimit)
  if (platform === 'bilibili') {
    videos = videos.map((video) => freshIds.has(video.id)
      ? { ...video, history: appendSnapshot(video, capturedAt) }
      : video)
    videos = scoreBilibiliVideos(videos, new Date(capturedAt).getTime())
  }
  return videos
}

function mergeCreators(previousCreators = [], freshCreators = [], videos, platform) {
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
      platform,
      name: meta.name || group.name,
      url: meta.url || (platform === 'youtube' ? `https://www.youtube.com/channel/${id}` : `https://space.bilibili.com/${id}`),
      avatar: meta.avatar || '',
      followers: meta.followers || 0,
      qualifyingVideos: group.count,
      topCategories: [...group.categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }
  }).sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}

async function main() {
  let previous = {
    generatedAt: new Date(0).toISOString(),
    lookbackDays,
    sources: {
      youtube: { status: 'unavailable', updatedAt: null },
      bilibili: { status: 'unavailable', updatedAt: null },
    },
    videos: { youtube: [], bilibili: [] },
    creators: { youtube: [], bilibili: [] },
  }
  try {
    previous = JSON.parse(await fs.readFile(outputPath, 'utf8'))
  } catch {}

  const next = structuredClone(previous)
  next.generatedAt = new Date().toISOString()
  next.lookbackDays = lookbackDays

  const collectors = process.env.YOUTUBE_API_KEY
    ? [['youtube', collectYouTube], ['bilibili', collectBilibili]]
    : [['bilibili', collectBilibili]]
  for (const [platform, collect] of collectors) {
    try {
      const result = await collect()
      next.videos[platform] = mergeVideos(previous.videos?.[platform], result.videos, platform, next.generatedAt)
      next.creators[platform] = mergeCreators(previous.creators?.[platform], result.creators, next.videos[platform], platform)
      next.sources[platform] = { status: 'live', updatedAt: next.generatedAt }
      console.log(`${platform}: ${result.videos.length} fresh, ${next.videos[platform].length} in library, ${next.creators[platform].length} creators`)
    } catch (error) {
      const hasPrevious = (previous.videos?.[platform]?.length || 0) > 0
      next.sources[platform] = {
        status: hasPrevious ? 'stale' : 'unavailable',
        updatedAt: previous.sources?.[platform]?.updatedAt || null,
        note: String(error?.message || error),
      }
      console.warn(`${platform}: ${next.sources[platform].status} (${next.sources[platform].note})`)
    }
  }

  await fs.writeFile(outputPath, `${JSON.stringify(annotateHostProfiles(next), null, 2)}\n`, 'utf8')
}

await main()
