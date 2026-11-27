import test from 'node:test'
import assert from 'node:assert/strict'
import { parseChannelVideos } from '../scripts/backfill-creators.mjs'

test('reads current YouTube channel video cards without treating thumbnails as gender evidence', () => {
  const initial = { contents: { items: [
    { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'abc123', metadata: { lockupMetadataViewModel: { title: { content: 'ASMR sleep' } } }, contentImage: { thumbnailViewModel: { image: { sources: [{ url: 'https://example.com/cover.jpg' }] }, overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: '20:10' } }] } }] } } } },
    { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'short', metadata: { lockupMetadataViewModel: { title: { content: 'ASMR short' } } }, contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: '2:59' } }] } }] } } } },
  ] } }
  const videos = parseChannelVideos(initial, { id: 'UCtest', name: 'Creator', url: 'https://www.youtube.com/channel/UCtest' })
  assert.equal(videos.length, 1)
  assert.equal(videos[0].id, 'abc123')
  assert.equal(videos[0].durationSeconds, 1210)
  assert.equal(videos[0].creatorId, 'UCtest')
})
