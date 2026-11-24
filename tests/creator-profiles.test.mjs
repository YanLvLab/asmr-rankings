import test from 'node:test'
import assert from 'node:assert/strict'
import { annotateHostProfiles, femaleLedProfile } from '../scripts/creator-profiles.mjs'

test('labels known channels by stable platform ID and leaves unknown channels unlabelled', () => {
  assert.equal(femaleLedProfile('youtube', 'UCmZb4LwQRhEzZX5Uqpcqziw', 'Coromo Sara. ASMR'), 'curated-channel')
  assert.equal(femaleLedProfile('youtube', 'unknown', 'A pretty name'), null)
  assert.equal(femaleLedProfile('bilibili', 'unknown', '女声主播助眠'), 'channel-self-description')
})

test('new videos inherit their creator category without using video title as gender evidence', () => {
  const data = {
    creators: {
      youtube: [
        { id: 'UCmZb4LwQRhEzZX5Uqpcqziw', name: 'Coromo Sara. ASMR' },
        { id: 'unknown', name: 'Unknown' },
      ],
      bilibili: [],
    },
    videos: {
      youtube: [
        { creatorId: 'UCmZb4LwQRhEzZX5Uqpcqziw', title: 'New sleep ASMR' },
        { creatorId: 'unknown', title: '小姐姐助眠 ASMR' },
      ],
      bilibili: [],
    },
  }
  annotateHostProfiles(data)
  assert.equal(data.videos.youtube[0].femaleHost, true)
  assert.equal(data.videos.youtube[1].femaleHost, false)
})
