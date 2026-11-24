import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { annotateHostProfiles } from './creator-profiles.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(here, '../public/data/rankings.json')
const data = annotateHostProfiles(JSON.parse(await fs.readFile(outputPath, 'utf8')))
await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
for (const platform of ['youtube', 'bilibili']) {
  console.log(`${platform}: ${data.creators[platform].filter((creator) => creator.femaleHost).length} channels, ${data.videos[platform].filter((video) => video.femaleHost).length} videos`)
}
