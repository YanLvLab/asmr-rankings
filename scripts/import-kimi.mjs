import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendSnapshot, scoreBilibiliVideos } from './scoring.mjs'
import { screenCandidate } from './screening.mjs'
import { annotateHostProfiles } from './creator-profiles.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(here, '../public/data/rankings.json')
const inputPath = process.argv[2]

if (!inputPath) {
  throw new Error('用法：node scripts/import-kimi.mjs <Kimi public/data.json>')
}

const isoFromKimi = (value) => {
  if (Number.isFinite(Number(value))) return new Date(Number(value) * 1000).toISOString()
  return new Date(`${String(value).replace(' ', 'T')}+08:00`).toISOString()
}

function rebuildCreators(videos, previousCreators = []) {
  const metadata = new Map(previousCreators.map((creator) => [creator.id, creator]))
  const grouped = new Map()
  for (const video of videos) {
    const current = grouped.get(video.creatorId) || { name: video.creatorName, count: 0, categories: new Map() }
    current.count += 1
    for (const category of video.categories) current.categories.set(category, (current.categories.get(category) || 0) + 1)
    grouped.set(video.creatorId, current)
  }
  return [...grouped.entries()].map(([id, group]) => {
    const old = metadata.get(id) || {}
    return {
      id,
      platform: 'bilibili',
      name: old.name || group.name,
      url: old.url || `https://space.bilibili.com/${id}`,
      avatar: old.avatar || '',
      followers: old.followers || 0,
      qualifyingVideos: group.count,
      topCategories: [...group.categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }
  }).sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}

const [rankingData, kimiData] = await Promise.all([
  fs.readFile(outputPath, 'utf8').then(JSON.parse),
  fs.readFile(path.resolve(inputPath), 'utf8').then(JSON.parse),
])

const capturedAt = isoFromKimi(kimiData.generated_at)
const videos = new Map((rankingData.videos?.bilibili || []).map((video) => [video.id, video]))
let added = 0
let enriched = 0
let rejected = 0

for (const source of kimiData.videos || []) {
  if (Number(source.duration || 0) < 180) {
    rejected += 1
    continue
  }
  const existing = videos.get(source.bvid)
  const screening = screenCandidate({
    platform: 'bilibili',
    title: source.title,
    description: existing?.description || '',
    tags: source.tags,
    durationSeconds: source.duration,
    creatorName: source.up_name,
  })
  if (!existing && !screening.approved) {
    rejected += 1
    continue
  }
  const base = existing || {
    id: source.bvid,
    platform: 'bilibili',
    title: source.title,
    description: '',
    url: `https://www.bilibili.com/video/${source.bvid}`,
    thumbnail: String(source.cover || '').replace(/^http:/, 'https:'),
    creatorId: String(source.up_mid || ''),
    creatorName: source.up_name || '未知 UP 主',
    publishedAt: isoFromKimi(source.pubdate),
    durationSeconds: Number(source.duration || 0),
    views: Number(source.view || 0),
    likes: Number(source.like || 0),
    comments: Number(source.reply || 0),
    categories: screening.categories,
    screeningConfidence: screening.confidence,
    screeningReasons: screening.reasons,
  }
  const merged = {
    ...base,
    favorites: Number(source.favorite || base.favorites || 0),
  }
  merged.history = appendSnapshot({ ...merged, views: Number(source.view || merged.views) }, capturedAt)
  videos.set(source.bvid, merged)
  if (existing) enriched += 1
  else added += 1
}

const scored = scoreBilibiliVideos([...videos.values()].sort((a, b) => b.views - a.views))
rankingData.videos.bilibili = scored
rankingData.creators.bilibili = rebuildCreators(scored, rankingData.creators?.bilibili)
rankingData.sources.bilibili.note = `公开搜索数据；已合并 Kimi 历史候选 ${added + enriched} 条`
await fs.writeFile(outputPath, `${JSON.stringify(annotateHostProfiles(rankingData), null, 2)}\n`, 'utf8')

console.log(`Kimi merge: ${added} added, ${enriched} enriched, ${rejected} rejected; Bilibili library ${scored.length}`)
