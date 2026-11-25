import type { Platform, RankedCreator, RankedVideo, RankingData } from '../types'
import { getLanguage, t } from './i18n'

export type Scope = 'all' | Platform
export type DurationFilter = 'all' | 'short' | 'medium' | 'long'
export type PeriodFilter = 'all' | '7' | '30' | '365'
export type SortKey = 'latest' | 'views' | 'likes' | 'duration' | 'captured'
export type RankingKey = 'hot' | 'rising' | 'longtail' | 'youtube' | 'bilibili'
export type Filters = {
  query: string
  platform: Scope
  category: string
  duration: DurationFilter
  period: PeriodFilter
  femaleOnly: boolean
  sort: SortKey
}

export const defaultFilters: Filters = { query: '', platform: 'all', category: '全部类型', duration: 'all', period: 'all', femaleOnly: false, sort: 'latest' }
export const platformName: Record<Platform, string> = { youtube: 'YouTube', bilibili: '哔哩哔哩' }
export const videoKey = (video: Pick<RankedVideo, 'platform' | 'id'>) => `${video.platform}:${video.id}`
export const creatorKey = (creator: Pick<RankedCreator, 'platform' | 'id'>) => `${creator.platform}:${creator.id}`
export const allVideos = (data: RankingData) => [...data.videos.youtube, ...data.videos.bilibili]
export const allCreators = (data: RankingData) => [...data.creators.youtube, ...data.creators.bilibili]
export const categories = (data: RankingData) => ['全部类型', ...Array.from(new Set(allVideos(data).flatMap(video => video.categories))).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
export const formatNumber = (value: number) => new Intl.NumberFormat(getLanguage() === 'en' ? 'en-US' : 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
export const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
export const formatDate = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-US' : 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : t('暂无数据')

export function safeExternalUrl(url: string, platform: Platform, kind: 'video' | 'creator') {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    if (platform === 'youtube') {
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) return null
      if (kind === 'video' && !(parsed.pathname === '/watch' && parsed.searchParams.has('v')) && host !== 'youtu.be' && !parsed.pathname.startsWith('/shorts/')) return null
    } else {
      if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'space.bilibili.com'].includes(host)) return null
      if (kind === 'video' && !parsed.pathname.startsWith('/video/')) return null
    }
    return parsed.href
  } catch { return null }
}

export function filterVideos(videos: RankedVideo[], filters: Filters) {
  const query = filters.query.trim().toLocaleLowerCase()
  const cutoff = filters.period === 'all' ? 0 : Date.now() - Number(filters.period) * 86400000
  return videos.filter(video =>
    (filters.platform === 'all' || video.platform === filters.platform) &&
    (filters.category === '全部类型' || video.categories.includes(filters.category)) &&
    (!filters.femaleOnly || !!video.femaleHost) &&
    (!cutoff || Date.parse(video.publishedAt) >= cutoff) &&
    (filters.duration === 'all' || (filters.duration === 'short' && video.durationSeconds < 900) || (filters.duration === 'medium' && video.durationSeconds >= 900 && video.durationSeconds < 3600) || (filters.duration === 'long' && video.durationSeconds >= 3600)) &&
    (!query || `${video.title} ${video.creatorName}`.toLocaleLowerCase().includes(query))
  ).sort((a, b) => {
    if (filters.sort === 'views') return b.views - a.views
    if (filters.sort === 'likes') return b.likes - a.likes
    if (filters.sort === 'duration') return b.durationSeconds - a.durationSeconds
    if (filters.sort === 'captured') return (Date.parse(b.history?.at(-1)?.capturedAt || '') || 0) - (Date.parse(a.history?.at(-1)?.capturedAt || '') || 0)
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
  })
}

export function rankVideos(data: RankingData, key: RankingKey) {
  if (key === 'youtube' || key === 'bilibili') return [...data.videos[key]].sort((a, b) => b.views - a.views)
  return [...data.videos.bilibili].filter(video => video.scores?.[key] != null).sort((a, b) => (b.scores?.[key] ?? 0) - (a.scores?.[key] ?? 0))
}

export function filterCreators(creators: RankedCreator[], query: string, platform: Scope, category: string, femaleOnly: boolean) {
  const needle = query.trim().toLocaleLowerCase()
  return creators.filter(creator =>
    (platform === 'all' || creator.platform === platform) &&
    (category === '全部类型' || creator.topCategories.includes(category)) &&
    (!femaleOnly || !!creator.femaleHost) &&
    (!needle || creator.name.toLocaleLowerCase().includes(needle))
  ).sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
}
