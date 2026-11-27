export type Platform = 'youtube' | 'bilibili'

export type SourceStatus = {
  status: 'live' | 'stale' | 'unavailable'
  updatedAt: string | null
  note?: string
}

export type RankedVideo = {
  id: string
  platform: Platform
  title: string
  description: string
  url: string
  thumbnail: string
  creatorId: string
  creatorName: string
  creatorAvatar?: string
  publishedAt: string
  durationSeconds: number
  views: number
  likes: number
  favorites?: number
  comments: number
  categories: string[]
  screeningConfidence: number
  screeningReasons: string[]
  femaleHost?: boolean
  history?: Array<{
    capturedAt: string
    views: number
    likes: number
    favorites: number
  }>
  scores?: {
    hot: number | null
    rising: number | null
    longtail: number | null
    hasSevenDaySnapshot: boolean
  }
}

export type RankedCreator = {
  id: string
  platform: Platform
  name: string
  url: string
  avatar?: string
  description?: string
  followers: number
  qualifyingVideos: number
  topCategories: string[]
  femaleHost?: boolean
  femaleHostEvidence?: 'curated-channel' | 'channel-self-description' | null
}

export type RankingData = {
  generatedAt: string
  lookbackDays: number
  sources: Record<Platform, SourceStatus>
  videos: Record<Platform, RankedVideo[]>
  creators: Record<Platform, RankedCreator[]>
}
