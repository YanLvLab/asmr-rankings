export function publishedAtFromWatchHtml(html, microformat = {}) {
  const candidates = [
    microformat.publishDate,
    microformat.uploadDate,
    html.match(/<meta[^>]*itemprop=["']datePublished["'][^>]*content=["']([^"']+)/i)?.[1],
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']datePublished["']/i)?.[1],
    html.match(/"publishDate":"([^"]+)"/i)?.[1],
    html.match(/"uploadDate":"([^"]+)"/i)?.[1],
  ]
  for (const candidate of candidates) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(candidate || ''))) continue
    const timestamp = Date.parse(candidate)
    if (Number.isFinite(timestamp) && timestamp <= Date.now() + 86_400_000) {
      return new Date(timestamp).toISOString()
    }
  }
  return null
}
