import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Headphones,
  Heart,
  Info,
  MoonStar,
  Play,
  Radio,
  RefreshCw,
  Search,
  Star,
  UsersRound,
  Waves,
} from 'lucide-react'
import type { Platform, RankedCreator, RankedVideo, RankingData } from './types'

const emptyData: RankingData = {
  generatedAt: new Date(0).toISOString(),
  lookbackDays: 365,
  sources: {
    youtube: { status: 'unavailable', updatedAt: null },
    bilibili: { status: 'unavailable', updatedAt: null },
  },
  videos: { youtube: [], bilibili: [] },
  creators: { youtube: [], bilibili: [] },
}

const platformLabel: Record<Platform, string> = { youtube: 'YouTube', bilibili: '哔哩哔哩' }
const categoryOrder = ['全部', '无人声', '耳语', '敲击', '掏耳', '角色扮演', '口腔音', '刷麦', '环境音', '综合触发']
type RankingMode = 'library' | 'hot' | 'rising' | 'longtail'

const rankingModes: Array<{ key: RankingMode; label: string; note: string }> = [
  { key: 'library', label: '双平台资源库', note: '按公开数据排序，汇总全部合格内容' },
  { key: 'hot', label: 'B站今日热榜', note: '播放、点赞率、收藏率、增速与时间衰减' },
  { key: 'rising', label: 'B站本周上升', note: '近 30 天发布，以七日增速为主' },
  { key: 'longtail', label: 'B站长尾常听', note: '发布超过 30 天，收藏率权重最高' },
]

function compactNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours ? `${hours} 小时${minutes ? ` ${minutes} 分钟` : ''}` : `${minutes} 分钟`
}

function relativeUpdate(value: string | null) {
  if (!value) return '尚未更新'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} 分钟前更新`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前更新`
  return `${Math.floor(minutes / 1440)} 天前更新`
}

function WaveMark() {
  return (
    <div className="wave-mark" aria-hidden="true">
      {[18, 31, 45, 23, 54, 38, 66, 29, 47, 20, 35, 16].map((height, index) => (
        <i key={index} style={{ height, animationDelay: `${index * -90}ms` }} />
      ))}
    </div>
  )
}

function StatusPill({ platform, data }: { platform: Platform; data: RankingData }) {
  const source = data.sources[platform]
  return (
    <div className={`source-pill source-${source.status}`} title={source.note || ''}>
      <span className="status-dot" />
      <strong>{platformLabel[platform]}</strong>
      <span>{relativeUpdate(source.updatedAt)}</span>
    </div>
  )
}

function VideoCard({ video, rank, rankingMode }: { video: RankedVideo; rank: number; rankingMode: RankingMode }) {
  const score = rankingMode === 'library' ? null : video.scores?.[rankingMode]
  return (
    <article className="video-card">
      <a className="cover" href={video.url} target="_blank" rel="noreferrer" aria-label={`打开 ${video.title}`}>
        <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
        <span className="rank-number">{String(rank).padStart(2, '0')}</span>
        <span className="duration"><Clock3 size={13} />{durationLabel(video.durationSeconds)}</span>
        <span className="play-orbit"><Play size={17} fill="currentColor" /></span>
      </a>
      <div className="video-copy">
        <div className="eyebrow-row">
          <span className={`platform-tag ${video.platform}`}>{platformLabel[video.platform]}</span>
          <span>{dateLabel(video.publishedAt)}</span>
        </div>
        <h3><a href={video.url} target="_blank" rel="noreferrer">{video.title}</a></h3>
        <div className="creator-line">
          {video.creatorAvatar ? <img src={video.creatorAvatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback" />}
          <span>{video.creatorName}</span>
          {video.femaleHost && <span className="female-tag">小姐姐频道</span>}
        </div>
        <div className="metric-row">
          <strong>{compactNumber(video.views)} <small>播放</small></strong>
          <span>{compactNumber(video.likes)} 赞</span>
          {video.favorites ? <span><Star size={13} />{compactNumber(video.favorites)} 收藏</span> : null}
          <span className="confidence"><CheckCircle2 size={14} />已通过筛选</span>
        </div>
        {score != null ? <div className="board-score"><span>榜单分</span><strong>{score.toFixed(4)}</strong>{rankingMode === 'longtail' ? <small>收藏率权重最高</small> : video.scores?.hasSevenDaySnapshot ? <small>真实七日增速</small> : <small>增速取中性值</small>}</div> : null}
        <div className="category-row">
          {video.categories.slice(0, 3).map((category) => <span key={category}>{category}</span>)}
        </div>
      </div>
    </article>
  )
}

function CreatorRow({ creator, rank }: { creator: RankedCreator; rank: number }) {
  return (
    <a className="creator-row" href={creator.url} target="_blank" rel="noreferrer">
      <span className="creator-rank">{String(rank).padStart(2, '0')}</span>
      <span className="creator-avatar">
        {creator.avatar ? <img src={creator.avatar} alt="" referrerPolicy="no-referrer" /> : creator.name.slice(0, 1)}
        <i className={creator.platform} />
      </span>
      <span className="creator-name">
        <strong>{creator.name}{creator.femaleHost && <span className="creator-female-tag">小姐姐频道</span>}</strong>
        <small>{creator.topCategories.join(' · ') || '综合助眠'}</small>
      </span>
      <span className="creator-stat">
        <strong>{compactNumber(creator.followers)}</strong>
        <small>{creator.platform === 'youtube' ? '订阅' : '粉丝'}</small>
      </span>
      <span className="creator-stat muted">
        <strong>{creator.qualifyingVideos}</strong>
        <small>合格作品</small>
      </span>
      <ArrowUpRight size={18} />
    </a>
  )
}

export default function App() {
  const [data, setData] = useState<RankingData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [platform, setPlatform] = useState<'all' | Platform>('all')
  const [category, setCategory] = useState('全部')
  const [period, setPeriod] = useState<'7' | '30' | 'all'>('all')
  const [sort, setSort] = useState<'views' | 'likes' | 'latest' | 'duration'>('views')
  const [duration, setDuration] = useState<'all' | 'short' | 'mid' | 'long'>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'videos' | 'creators'>('videos')
  const [rankingMode, setRankingMode] = useState<RankingMode>('library')
  const [femaleOnly, setFemaleOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(32)

  useEffect(() => {
    fetch('./data/rankings.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('data unavailable')
        return response.json()
      })
      .then((payload: RankingData) => setData(payload))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  const videos = useMemo(() => {
    const cutoff = period === 'all' ? 0 : Date.now() - Number(period) * 86400000
    const effectivePlatform = rankingMode === 'library' ? platform : 'bilibili'
    const pool = effectivePlatform === 'all'
      ? [...data.videos.youtube, ...data.videos.bilibili]
      : data.videos[effectivePlatform]
    const filtered = pool
      .filter((video) => rankingMode === 'library' || video.scores?.[rankingMode] != null)
      .filter((video) => !femaleOnly || video.femaleHost)
      .filter((video) => new Date(video.publishedAt).getTime() >= cutoff)
      .filter((video) => category === '全部' || video.categories.includes(category))
      .filter((video) => duration === 'all'
        || (duration === 'short' && video.durationSeconds < 900)
        || (duration === 'mid' && video.durationSeconds >= 900 && video.durationSeconds < 3600)
        || (duration === 'long' && video.durationSeconds >= 3600))
      .filter((video) => `${video.title} ${video.creatorName}`.toLowerCase().includes(search.trim().toLowerCase()))
    return filtered.sort((a, b) => {
      if (rankingMode !== 'library') return (b.scores?.[rankingMode] || 0) - (a.scores?.[rankingMode] || 0)
      if (sort === 'likes') return b.likes - a.likes
      if (sort === 'latest') return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      if (sort === 'duration') return b.durationSeconds - a.durationSeconds
      return b.views - a.views
    })
  }, [data, platform, category, period, search, sort, duration, rankingMode, femaleOnly])

  useEffect(() => setVisibleCount(32), [platform, category, period, search, sort, duration, view, rankingMode, femaleOnly])

  const creators = useMemo(() => {
    const pool = platform === 'all'
      ? [...data.creators.youtube, ...data.creators.bilibili]
      : data.creators[platform]
    return pool
      .filter((creator) => !femaleOnly || creator.femaleHost)
      .filter((creator) => category === '全部' || creator.topCategories.includes(category))
      .filter((creator) => creator.name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => b.followers - a.followers || b.qualifyingVideos - a.qualifyingVideos)
  }, [data, platform, category, search, femaleOnly])

  const totalVideos = data.videos.youtube.length + data.videos.bilibili.length
  const totalCreators = data.creators.youtube.length + data.creators.bilibili.length
  const femaleVideos = data.videos.youtube.filter((video) => video.femaleHost).length + data.videos.bilibili.filter((video) => video.femaleHost).length
  const femaleCreators = data.creators.youtube.filter((creator) => creator.femaleHost).length + data.creators.bilibili.filter((creator) => creator.femaleHost).length
  const risingCandidates = data.videos.bilibili.filter((video) => video.scores?.rising != null)
  const risingWithSnapshot = risingCandidates.filter((video) => video.scores?.hasSevenDaySnapshot).length
  const risingHasCompleteGrowth = risingCandidates.length > 0 && risingWithSnapshot === risingCandidates.length
  const featuredVideo = [...data.videos.youtube, ...data.videos.bilibili]
    .filter((video) => !femaleOnly || video.femaleHost)
    .sort((a, b) => b.views - a.views)[0]

  function chooseListeningPath(path: 'quiet' | 'whisper' | 'long' | 'female') {
    setView('videos')
    setRankingMode('library')
    setPlatform('all')
    setPeriod('all')
    setSearch('')
    setSort('views')
    setCategory(path === 'quiet' ? '无人声' : path === 'whisper' ? '耳语' : '全部')
    setDuration(path === 'long' ? 'long' : 'all')
    setFemaleOnly(path === 'female')
  }

  return (
    <main>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="site-header">
        <a className="brand" href="#top" aria-label="静响榜首页">
          <WaveMark />
          <span><b>静响榜</b><small>HUSH INDEX</small></span>
        </a>
        <nav>
          <a href="#rankings">探索资源</a>
          <a href="#method">筛选方法</a>
          <a href="#data">数据状态</a>
        </nav>
        <div className="live-badge"><Radio size={14} /> THE NIGHTLY EDITION</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="kicker"><MoonStar size={16} /> 双平台助眠资源索引 · 2026</div>
          <h1>今夜，<br />听点 <em>好的。</em></h1>
          <p>为你整理 YouTube 与哔哩哔哩的 ASMR 长视频。按声音、时长与喜欢的博主寻找内容，在原平台继续听。</p>
          <div className="hero-actions">
            <a className="primary-cta" href="#rankings"><Headphones size={18} />进入资源库<span>↗</span></a>
            <a className="secondary-cta" href="#rankings" onClick={() => setFemaleOnly(true)}><Heart size={17} />只看小姐姐</a>
          </div>
          <div className="hero-countline"><span><strong>{totalVideos}</strong> 支长视频</span><i /><span><strong>{totalCreators}</strong> 位创作者</span><i /><span><strong>2</strong> 个平台</span></div>
        </div>
        <div className="hero-feature" aria-label="精选助眠视频">
          <div className="feature-top"><span>HUSH / EDITION 001</span><span>FEATURED LISTENING</span></div>
          {featuredVideo ? <>
            <a className="feature-cover" href={featuredVideo.url} target="_blank" rel="noreferrer" aria-label={`前往原平台观看：${featuredVideo.title}`}>
              <img src={featuredVideo.thumbnail} alt="" referrerPolicy="no-referrer" />
              <span className="feature-play"><Play size={21} fill="currentColor" /></span>
            </a>
            <div className="feature-caption"><span>今夜精选 · {platformLabel[featuredVideo.platform]}</span><strong>{featuredVideo.title}</strong><small>{featuredVideo.creatorName} · {durationLabel(featuredVideo.durationSeconds)}</small></div>
          </> : <div className="feature-empty"><Waves size={60} strokeWidth={1} /><span>正在整理今晚的声音</span></div>}
          <div className="feature-bottom"><span>CURATED FOR QUIET HOURS</span><span>01 / 02</span></div>
          </div>
      </section>

      <section className="source-strip" id="data">
        <div className="strip-label"><RefreshCw size={15} /> 精选快照</div>
        {loading ? <span className="source-pending">正在读取平台数据…</span> : <>
          <StatusPill platform="youtube" data={data} />
          <StatusPill platform="bilibili" data={data} />
          {!loadError && <div className="generated-time"><CalendarDays size={15} />本轮生成：{dateLabel(data.generatedAt)}</div>}
        </>}
      </section>

      <section className="listening-paths" aria-label="快速开始">
        <div className="paths-intro"><span>00 / THE LISTENING ROOM</span><h2>从一种声音开始。</h2><p>给今晚一个方向，再去资源库慢慢挑。</p></div>
        <div className="path-grid">
          <a href="#rankings" className="path-card" onClick={() => chooseListeningPath('quiet')}><span className="path-index">01 / SILENCE</span><Waves size={28} strokeWidth={1.3} /><strong>无人声</strong><small>让触发音自己说话</small><ArrowUpRight size={17} className="path-arrow" /></a>
          <a href="#rankings" className="path-card" onClick={() => chooseListeningPath('whisper')}><span className="path-index">02 / WHISPER</span><Radio size={28} strokeWidth={1.3} /><strong>轻声耳语</strong><small>有人在耳边轻轻陪伴</small><ArrowUpRight size={17} className="path-arrow" /></a>
          <a href="#rankings" className="path-card" onClick={() => chooseListeningPath('long')}><span className="path-index">03 / LONG PLAY</span><Clock3 size={28} strokeWidth={1.3} /><strong>长时陪伴</strong><small>一小时以上，慢慢入睡</small><ArrowUpRight size={17} className="path-arrow" /></a>
          <a href="#rankings" className="path-card" onClick={() => chooseListeningPath('female')}><span className="path-index">04 / HER VOICE</span><Heart size={28} strokeWidth={1.3} /><strong>小姐姐频道</strong><small>只看已标注的女性博主</small><ArrowUpRight size={17} className="path-arrow" /></a>
        </div>
      </section>

      <section className="rankings" id="rankings">
        <div className="section-heading">
          <div><span className="section-no">01</span><p>EXPLORE THE COLLECTION</p><h2>找到今晚想听的</h2></div>
          <p className="heading-note">从 {totalVideos} 支合格长视频和 {totalCreators} 位创作者中挑选，点开即去原平台收听。</p>
        </div>

        <div className="host-filter" aria-label="博主偏好">
          <div className="host-filter-copy"><span>YOUR LISTENING PREFERENCE</span><strong>先选你想听谁</strong><small>此偏好同时作用于视频榜与博主榜</small></div>
          <div className="host-filter-options">
            <button type="button" className={!femaleOnly ? 'active' : ''} aria-pressed={!femaleOnly} onClick={() => setFemaleOnly(false)}><UsersRound size={19} /><span><strong>全部博主</strong><small>{totalCreators} 位创作者 · {totalVideos} 支视频</small></span></button>
            <button type="button" className={femaleOnly ? 'active' : ''} aria-pressed={femaleOnly} onClick={() => setFemaleOnly(true)}><Heart size={19} /><span><strong>只看小姐姐</strong><small>{femaleCreators} 位已标注博主 · {femaleVideos} 支视频</small></span></button>
          </div>
          <p>依据预置频道标注与明确自述筛选；未标注频道不被猜测归类。<a href="#method">了解口径 ↗</a></p>
        </div>

        <div className="controls">
          <div className="segmented view-switch">
            <button className={view === 'videos' ? 'active' : ''} aria-pressed={view === 'videos'} onClick={() => setView('videos')}><Play size={15} />视频榜</button>
            <button className={view === 'creators' ? 'active' : ''} aria-pressed={view === 'creators'} onClick={() => setView('creators')}><UsersRound size={15} />博主榜</button>
          </div>
          <div className="segmented platform-switch">
            {(['all', 'youtube', 'bilibili'] as const).map((item) => (
              <button key={item} className={platform === item ? 'active' : ''} aria-pressed={platform === item} onClick={() => { setPlatform(item); setRankingMode('library') }}>
                {item === 'all' ? '双平台' : platformLabel[item]}
              </button>
            ))}
          </div>
          <label className="search-box"><Search size={16} /><input aria-label="搜索视频或创作者" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜视频或创作者" /></label>
          {view === 'videos' && (
            <label className="select-box"><CalendarDays size={15} /><select value={period} onChange={(event) => setPeriod(event.target.value as '7' | '30' | 'all')}><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="all">全部时间</option></select><ChevronDown size={14} /></label>
          )}
          {view === 'videos' && (
            <label className="select-box"><Clock3 size={15} /><select value={duration} onChange={(event) => setDuration(event.target.value as typeof duration)}><option value="all">全部时长</option><option value="short">3–15 分钟</option><option value="mid">15–60 分钟</option><option value="long">60 分钟以上</option></select><ChevronDown size={14} /></label>
          )}
          {view === 'videos' && rankingMode === 'library' && (
            <label className="select-box"><Waves size={15} /><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="views">播放最多</option><option value="likes">点赞最多</option><option value="latest">最新发布</option><option value="duration">时长最长</option></select><ChevronDown size={14} /></label>
          )}
          {view === 'videos' && rankingMode !== 'library' && <span className="fixed-sort"><CheckCircle2 size={15} />按榜单分排序</span>}
        </div>

        {view === 'videos' && <div className="ranking-modes" aria-label="榜单类型">
          {rankingModes.map((mode) => <button key={mode.key} className={rankingMode === mode.key ? 'active' : ''} aria-pressed={rankingMode === mode.key} onClick={() => { setRankingMode(mode.key); if (mode.key !== 'library') setPlatform('bilibili') }}><strong>{mode.key === 'rising' && !risingHasCompleteGrowth ? 'B站近期新作' : mode.label}</strong><small>{mode.key === 'rising' && !risingHasCompleteGrowth ? `近 30 天发布；${risingWithSnapshot}/${risingCandidates.length} 条有七日快照` : mode.note}</small></button>)}
        </div>}

        <div className="categories" aria-label="内容分类">
          {categoryOrder.map((item) => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>

        {loading ? (
          <div className="state-card"><RefreshCw className="spin" /><strong>正在读取这一夜的数据…</strong></div>
        ) : loadError ? (
          <div className="state-card warning"><Info /><strong>榜单数据读取失败</strong><span>请检查 public/data/rankings.json 是否已由采集任务生成。</span></div>
        ) : view === 'videos' ? (
          videos.length ? <>
            <div className="results-meta"><strong>{videos.length}</strong> 条符合当前条件 · {femaleOnly ? '只看已标注小姐姐频道 · ' : ''}最低时长 3 分钟{rankingMode !== 'library' ? ' · B站独立公式榜' : ''}{rankingMode === 'rising' && !risingHasCompleteGrowth ? ` · ${risingWithSnapshot}/${risingCandidates.length} 条有七日快照` : ''}</div>
            <div className="video-grid">{videos.slice(0, visibleCount).map((video, index) => <VideoCard key={`${video.platform}-${video.id}`} video={video} rank={index + 1} rankingMode={rankingMode} />)}</div>
            {visibleCount < videos.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 24)}>再加载 24 条 <span>{visibleCount}/{videos.length}</span></button>}
          </>
          : <div className="state-card"><MoonStar /><strong>这个筛选下没有合格视频</strong><span>可以切换平台、时段或博主偏好。</span></div>
        ) : creators.length ? (
          <div className="creator-list">{creators.map((creator, index) => <CreatorRow key={`${creator.platform}-${creator.id}`} creator={creator} rank={index + 1} />)}</div>
        ) : <div className="state-card"><UsersRound /><strong>这个筛选下没有合格创作者</strong></div>}
      </section>

      <section className="method" id="method">
        <div className="method-title"><span className="section-no">02</span><p>THE GATEKEEPER</p><h2>标签之外，<br />我们检查什么？</h2></div>
        <div className="method-grid">
          <article><span>01</span><Waves /><h3>意图必须明确</h3><p>标题、简介和标签需要同时呈现睡眠、入睡、失眠或明确放松目的。只有 “ASMR” 一个词不会被收录。</p></article>
          <article><span>02</span><Clock3 /><h3>至少三分钟</h3><p>少于 3 分钟直接排除；保留更完整的中长视频，同时过滤 Shorts、片段与高能剪辑。</p></article>
          <article><span>03</span><CheckCircle2 /><h3>负面语义一票否决</h3><p>反应、测评、挑战、恶搞、游戏解说、教程和疑似二次搬运，即使包含助眠标签也会自动退出候选。</p></article>
          <article><span>04</span><Heart /><h3>小姐姐频道怎么选</h3><p>根据预置频道 ID 或频道明确自述标注。新视频自动继承频道标注；未标注的频道留在“全部博主”中。此分类可能遗漏频道，也不代表平台提供的性别信息。</p></article>
        </div>
        <div className="method-footnote"><Info size={16} /><p>页面上的“已通过筛选”表示通过了本站的规则检查，不是平台认证；规则可能遗漏边界作品。缺少七日前快照时，榜单增速项按 0.5 的中性值计算。</p></div>
      </section>

      <footer>
        <div className="footer-brand"><WaveMark /><strong>静响榜</strong><span>让好内容，安静地被听见。</span></div>
        <p>非 YouTube 或哔哩哔哩官方榜单。视频版权与平台数据归各自权利人所有。本网站不缓存或下载视频内容。</p>
        <div><a href="./privacy.html">隐私政策</a><a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube 条款</a><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google 隐私</a><a href="#method">筛选说明</a></div>
      </footer>
    </main>
  )
}
