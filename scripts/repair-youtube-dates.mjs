import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchText } from './collect-youtube-public.mjs'
import { publishedAtFromWatchHtml } from './youtube-date.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(here, '../public/data/rankings.json')
const data = JSON.parse(await fs.readFile(outputPath, 'utf8'))
const suspectDay = process.env.SUSPECT_YOUTUBE_DATE || data.sources?.youtube?.updatedAt?.slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(suspectDay || '')) throw new Error('缺少有效的待核对日期')

const suspects = data.videos.youtube.filter((video) => video.publishedAt?.slice(0, 10) === suspectDay)
let corrected = 0
const unresolved = []
for (let index = 0; index < suspects.length; index += 4) {
  const batch = suspects.slice(index, index + 4)
  const results = await Promise.allSettled(batch.map(async (video) => {
    const html = await fetchText(video.url)
    return publishedAtFromWatchHtml(html)
  }))
  results.forEach((result, offset) => {
    const video = batch[offset]
    if (result.status === 'fulfilled' && result.value) {
      if (result.value !== video.publishedAt) corrected += 1
      video.publishedAt = result.value
    } else {
      unresolved.push(video.id)
    }
  })
  console.log(`checked ${Math.min(index + 4, suspects.length)}/${suspects.length}`)
}

data.generatedAt = new Date().toISOString()
await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
console.log(`youtube dates: ${corrected} corrected, ${unresolved.length} unresolved`)
if (unresolved.length) throw new Error(`无法核对发布时间：${unresolved.join(', ')}`)
