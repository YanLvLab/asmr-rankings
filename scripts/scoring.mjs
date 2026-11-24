const HOT_WEIGHTS = { play: 0.35, like: 0.25, favorite: 0.20, growth: 0.20 }
const RISING_WEIGHTS = { growth: 0.70, like: 0.15, favorite: 0.15 }
const LONGTAIL_WEIGHTS = { favorite: 0.45, like: 0.30, play: 0.25 }

const LIKE_RATE_CAP = 0.15
const FAVORITE_RATE_CAP = 0.12
const GROWTH_CAP = 3
const MIN_VIEW = 1000
const MIN_VIEW_RISING = 200
const RISING_MAX_AGE_DAYS = 30
const LONGTAIL_MIN_AGE_DAYS = 30
const DECAY_DAYS = 180
const DAY_MS = 86_400_000

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function snapshotNearSevenDays(history = [], now = Date.now()) {
  const target = now - 7 * DAY_MS
  return history
    .filter((entry) => Number(entry?.views) > 0 && new Date(entry.capturedAt).getTime() <= now - 5 * DAY_MS)
    .sort((a, b) => Math.abs(new Date(a.capturedAt).getTime() - target) - Math.abs(new Date(b.capturedAt).getTime() - target))[0]
}

export function appendSnapshot(video, capturedAt = new Date().toISOString()) {
  const history = [...(video.history || [])]
  const day = capturedAt.slice(0, 10)
  const snapshot = {
    capturedAt,
    views: Number(video.views || 0),
    likes: Number(video.likes || 0),
    favorites: Number(video.favorites || 0),
  }
  const sameDay = history.findIndex((entry) => String(entry.capturedAt).slice(0, 10) === day)
  if (sameDay >= 0) history[sameDay] = snapshot
  else history.push(snapshot)
  return history
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
    .slice(-16)
}

export function scoreBilibiliVideos(videos, now = Date.now()) {
  const maxView = Math.max(1, ...videos.map((video) => Number(video.views || 0)))
  const logMax = Math.log10(maxView + 1)

  return videos.map((video) => {
    const views = Number(video.views || 0)
    const likes = Number(video.likes || 0)
    const favorites = Number(video.favorites || 0)
    const publishedAt = new Date(video.publishedAt).getTime()
    const ageDays = Math.max(0, (now - publishedAt) / DAY_MS)
    const playScore = Math.log10(views + 1) / logMax
    const likeScore = clamp(views ? likes / views : 0, 0, LIKE_RATE_CAP) / LIKE_RATE_CAP
    const favoriteScore = clamp(views ? favorites / views : 0, 0, FAVORITE_RATE_CAP) / FAVORITE_RATE_CAP
    const snapshot = snapshotNearSevenDays(video.history, now)
    const growthScore = snapshot
      ? clamp((views - snapshot.views) / snapshot.views, 0, GROWTH_CAP) / GROWTH_CAP
      : 0.5

    const hotRaw = HOT_WEIGHTS.play * playScore
      + HOT_WEIGHTS.like * likeScore
      + HOT_WEIGHTS.favorite * favoriteScore
      + HOT_WEIGHTS.growth * growthScore
    const hot = views >= MIN_VIEW ? hotRaw * Math.exp(-ageDays / DECAY_DAYS) : null
    const rising = ageDays <= RISING_MAX_AGE_DAYS && views >= MIN_VIEW_RISING
      ? RISING_WEIGHTS.growth * growthScore
        + RISING_WEIGHTS.like * likeScore
        + RISING_WEIGHTS.favorite * favoriteScore
      : null
    const longtail = ageDays > LONGTAIL_MIN_AGE_DAYS && views >= MIN_VIEW
      ? LONGTAIL_WEIGHTS.favorite * favoriteScore
        + LONGTAIL_WEIGHTS.like * likeScore
        + LONGTAIL_WEIGHTS.play * playScore
      : null

    return {
      ...video,
      scores: {
        hot: hot == null ? null : Number(hot.toFixed(4)),
        rising: rising == null ? null : Number(rising.toFixed(4)),
        longtail: longtail == null ? null : Number(longtail.toFixed(4)),
        hasSevenDaySnapshot: Boolean(snapshot),
      },
    }
  })
}

export const SCORE_FORMULAS = {
  hot: HOT_WEIGHTS,
  rising: RISING_WEIGHTS,
  longtail: LONGTAIL_WEIGHTS,
}
