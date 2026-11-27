import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreBilibiliVideos } from './scoring.mjs'
import { hardRejectReasons } from './screening.mjs'
import { annotateHostProfiles } from './creator-profiles.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(here, '../public/data/rankings.json')

function qualifies(video) {
  return hardRejectReasons({
    platform: video.platform,
    title: video.title,
    description: video.description,
    tags: video.categories,
    durationSeconds: video.durationSeconds,
    creatorName: video.creatorName,
  }).length === 0
}

function rebuildCreators(videos, previousCreators, platform) {
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
      platform,
      name: old.name || group.name,
      url: old.url || (platform === 'youtube' ? `https://www.youtube.com/channel/${id}` : `https://space.bilibili.com/${id}`),
      avatar: old.avatar || '',
      description: old.description || '',
      followers: old.followers || 0,
      femaleHostEvidence: old.femaleHostEvidence || null,
      qualifyingVideos: group.count,
      topCategories: [...group.categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }
  }).sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}

const data = JSON.parse(await fs.readFile(outputPath, 'utf8'))
const bilibiliObservedAt = new Date(data.sources?.bilibili?.updatedAt || data.generatedAt).getTime()
for (const platform of ['youtube', 'bilibili']) {
  const before = data.videos[platform].length
  let videos = data.videos[platform].filter((video) => video.durationSeconds >= 180 && qualifies(video))
  if (platform === 'bilibili') videos = scoreBilibiliVideos(videos, Number.isFinite(bilibiliObservedAt) ? bilibiliObservedAt : Date.now())
  data.videos[platform] = videos
  data.creators[platform] = rebuildCreators(videos, data.creators[platform], platform)
  console.log(`${platform}: ${before} -> ${videos.length}`)
}
data.generatedAt = new Date().toISOString()
await fs.writeFile(outputPath, `${JSON.stringify(annotateHostProfiles(data), null, 2)}\n`, 'utf8')
