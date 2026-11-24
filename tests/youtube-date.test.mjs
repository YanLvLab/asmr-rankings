import test from 'node:test'
import assert from 'node:assert/strict'
import { publishedAtFromWatchHtml } from '../scripts/youtube-date.mjs'

test('uses the watch page publication date without inventing a current date', () => {
  const html = '<meta itemprop="datePublished" content="2021-12-02T08:12:20-08:00">'
  assert.equal(publishedAtFromWatchHtml(html), '2021-12-02T16:12:20.000Z')
  assert.equal(publishedAtFromWatchHtml('<html></html>'), null)
})
