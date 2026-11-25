import { defaultFilters, type Filters } from './catalog'

export type RecentItem = { key: string; openedAt: string }
export type LocalState = {
  version: 2
  savedVideos: string[]
  savedCreators: string[]
  recent: RecentItem[]
  rememberRecent: boolean
  filters: Filters
  display: 'grid' | 'list'
  theme: 'midnight' | 'deep'
}
const KEY = 'hush-index:v2'
const LEGACY_KEYS = ['hush-index:v1', 'hush-index']
export const initialState: LocalState = { version: 2, savedVideos: [], savedCreators: [], recent: [], rememberRecent: true, filters: defaultFilters, display: 'grid', theme: 'midnight' }
const validKey = (value: unknown) => typeof value === 'string' && /^(youtube|bilibili):[\w-]+$/.test(value)
const strings = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(validKey))] as string[] : []

export function normalizeState(value: unknown): LocalState {
  if (!value || typeof value !== 'object') return initialState
  const input = value as Record<string, unknown>
  const rawFilters = input.filters && typeof input.filters === 'object' ? input.filters as Record<string, unknown> : {}
  const f: Filters = {
    query: typeof rawFilters.query === 'string' ? rawFilters.query.slice(0, 200) : '',
    platform: ['all', 'youtube', 'bilibili'].includes(String(rawFilters.platform)) ? rawFilters.platform as Filters['platform'] : 'all',
    category: typeof rawFilters.category === 'string' ? rawFilters.category.slice(0, 40) : '全部类型',
    duration: ['all', 'short', 'medium', 'long'].includes(String(rawFilters.duration)) ? rawFilters.duration as Filters['duration'] : 'all',
    period: ['all', '7', '30', '365'].includes(String(rawFilters.period)) ? rawFilters.period as Filters['period'] : 'all',
    femaleOnly: rawFilters.femaleOnly === true,
    sort: ['latest', 'views', 'likes', 'duration', 'captured'].includes(String(rawFilters.sort)) ? rawFilters.sort as Filters['sort'] : 'latest',
  }
  const recent = Array.isArray(input.recent) ? input.recent.filter((item): item is RecentItem => !!item && typeof item === 'object' && validKey(item.key) && typeof item.openedAt === 'string' && !Number.isNaN(Date.parse(item.openedAt))).slice(0, 50) : []
  return { version: 2, savedVideos: strings(input.savedVideos), savedCreators: strings(input.savedCreators), recent,
    rememberRecent: input.rememberRecent !== false, filters: f,
    display: input.display === 'list' ? 'list' : 'grid', theme: input.theme === 'deep' ? 'deep' : 'midnight' }
}

export function readState(): LocalState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalizeState(JSON.parse(raw))
    for (const key of LEGACY_KEYS) {
      const older = localStorage.getItem(key)
      if (older) return normalizeState(JSON.parse(older))
    }
  } catch { /* Private browsing and corrupt records use a temporary session state. */ }
  return initialState
}

export function writeState(state: LocalState): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true } catch { return false }
}

export function exportState(state: LocalState) {
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `hush-index-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export async function importState(file: File): Promise<LocalState> {
  if (file.size > 1024 * 1024) throw new Error('备份文件超过 1 MB。')
  let value: unknown
  try { value = JSON.parse(await file.text()) } catch { throw new Error('无法读取 JSON 文件。') }
  if (!value || typeof value !== 'object' || !('version' in value) || ![1, 2].includes(Number(value.version))) throw new Error('这不是可识别的静响榜备份。')
  return normalizeState(value)
}
