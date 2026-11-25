import { getLanguage, setLanguage, t } from "./lib/i18n";import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, Bookmark, Compass, Download, Grid2X2, List, Search, Shuffle, SlidersHorizontal, Trash2, Trophy, Upload, Users, X } from 'lucide-react';
import VideoCard from './components/VideoCard';
import CreatorCard from './components/CreatorCard';
import type { RankedVideo, RankingData } from './types';
import { allCreators, allVideos, categories, creatorKey, defaultFilters, filterCreators, filterVideos, formatDate, platformName, rankVideos, safeExternalUrl, videoKey, type Filters, type RankingKey, type Scope } from './lib/catalog';
import { exportState, importState, readState, writeState, type LocalState } from './lib/storage';

type Page = 'discover' | 'rankings' | 'creators' | 'saved' | 'about';
type SavedTab = 'videos' | 'creators' | 'recent';
const pageNames: Record<Page, string> = { discover: '作品目录', rankings: '排行榜', creators: '创作者', saved: '收藏', about: '关于' };
const nav = [{ key: 'discover' as Page, icon: Compass }, { key: 'rankings' as Page, icon: Trophy }, { key: 'creators' as Page, icon: Users }, { key: 'saved' as Page, icon: Bookmark }];
const boards: Array<{key: RankingKey;label: string;note: string;}> = [
{ key: 'hot', label: 'B站今日热榜', note: '播放、互动、增速与发布时间' },
{ key: 'rising', label: '本周上升', note: '近 30 天作品，侧重七日增速' },
{ key: 'longtail', label: '长尾常听', note: '发布超过 30 天，侧重收藏率' },
{ key: 'youtube', label: 'YouTube 热门', note: '按公开播放量排列' },
{ key: 'bilibili', label: 'B站热门', note: '按公开播放量排列' }];

const route = (): Page => {const path = location.hash.slice(2).split('?')[0];return ['discover', 'rankings', 'creators', 'saved', 'about'].includes(path) ? path as Page : 'discover';};
function fromUrl(base: Filters): Filters {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  if (!p.size) return base;
  return {
    query: p.get('q')?.slice(0, 200) ?? base.query,
    platform: ['all', 'youtube', 'bilibili'].includes(p.get('platform') || '') ? p.get('platform') as Filters['platform'] : base.platform,
    category: p.get('category') || base.category,
    duration: ['all', 'short', 'medium', 'long'].includes(p.get('duration') || '') ? p.get('duration') as Filters['duration'] : base.duration,
    period: ['all', '7', '30', '365'].includes(p.get('period') || '') ? p.get('period') as Filters['period'] : base.period,
    femaleOnly: p.has('female') ? p.get('female') === '1' : base.femaleOnly,
    sort: ['latest', 'views', 'likes', 'duration', 'captured'].includes(p.get('sort') || '') ? p.get('sort') as Filters['sort'] : base.sort
  };
}
function toQuery(f: Filters) {
  const p = new URLSearchParams();
  if (f.query) p.set('q', f.query);
  if (f.platform !== 'all') p.set('platform', f.platform);
  if (f.category !== '全部类型') p.set('category', f.category);
  if (f.duration !== 'all') p.set('duration', f.duration);
  if (f.period !== 'all') p.set('period', f.period);
  if (f.femaleOnly) p.set('female', '1');
  if (f.sort !== 'latest') p.set('sort', f.sort);
  return p.toString();
}
function Brand() {return <a className="brand" href="#/discover" aria-label={t("静响榜首页")}><span className="brand-type">{getLanguage() === 'en' ? <strong>HUSH INDEX</strong> : <><strong>静响榜</strong><small>HUSH INDEX</small></>}</span></a>;}
function Select({ label, value, onChange, options }: {label: string;value: string;onChange: (value: string) => void;options: Array<[string, string]>;}) {return <label className="select-field"><span>{t(label)}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([key, name]) => <option value={key} key={key}>{t(name)}</option>)}</select></label>;}
function Empty({ title, text, action }: {title: string;text: string;action?: React.ReactNode;}) {return <div className="empty-state"><span className="empty-glyph">◇</span><h3>{title}</h3><p>{text}</p>{action}</div>;}
const durationOptions: Array<[string, string]> = [['all', '全部时长'], ['short', '15 分钟以内'], ['medium', '15–60 分钟'], ['long', '60 分钟以上']];
const periodOptions: Array<[string, string]> = [['all', '不限时间'], ['7', '近 7 天'], ['30', '近 30 天'], ['365', '近 1 年']];
const sortOptions: Array<[string, string]> = [['latest', '最新发布'], ['views', '播放最多'], ['likes', '点赞最多'], ['duration', '时长最长'], ['captured', '最近有快照']];

export default function App() {
  const [local, setLocal] = useState<LocalState>(() => {const stored = readState();setLanguage(stored.language);return { ...stored, filters: fromUrl(stored.filters) };});
  const [page, setPage] = useState<Page>(route);
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [visible, setVisible] = useState(24);
  const [rankVisible, setRankVisible] = useState(30);
  const [creatorVisible, setCreatorVisible] = useState(24);
  const [board, setBoard] = useState<RankingKey>('hot');
  const [savedTab, setSavedTab] = useState<SavedTab>('videos');
  const [creatorQuery, setCreatorQuery] = useState('');
  const [creatorPlatform, setCreatorPlatform] = useState<Scope>('all');
  const [creatorCategory, setCreatorCategory] = useState('全部类型');
  const [creatorFemale, setCreatorFemale] = useState(false);
  const [random, setRandom] = useState<RankedVideo | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [notice, setNotice] = useState('');
  const [showTop, setShowTop] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const f = local.filters;
  useEffect(() => {
    let active = true;
    setLoading(true);setLoadError(false);
    fetch(`${import.meta.env.BASE_URL}data/rankings.json`, { cache: 'no-store' }).
    then((r) => {if (!r.ok) throw new Error('network');return r.json();}).
    then((payload: RankingData) => {if (!payload.videos?.youtube || !payload.videos?.bilibili) throw new Error('invalid');if (active) setData(payload);}).
    catch(() => {if (active) setLoadError(true);}).
    finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [reload]);
  useEffect(() => {document.documentElement.lang = local.language === 'zh' ? 'zh-CN' : 'en'; document.title = local.language === 'zh' ? '静响榜 HUSH INDEX · ASMR 视频索引' : 'HUSH INDEX · ASMR Video Collection'; const description = document.querySelector('meta[name="description"]'); description?.setAttribute('content', local.language === 'zh' ? '静响榜汇总 YouTube 与哔哩哔哩的 ASMR 视频与创作者。搜索、筛选、收藏，然后直接前往原平台。' : 'Find ASMR videos and creators from YouTube and Bilibili. Search, filter and save, then open the original platform.'); if (!writeState(local)) setNotice(t('浏览器未开放本地存储，收藏仅在当前页面有效。'));}, [local]);
  useEffect(() => {
    const onHash = () => {setPage(route());setLocal((previous) => ({ ...previous, filters: fromUrl(previous.filters) }));setDrawer(false);window.scrollTo(0, 0);};
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {if (page === 'discover') {const q = toQuery(f);history.replaceState(null, '', `${location.pathname}${location.search}#/discover${q ? '?' + q : ''}`);}}, [f, page]);
  useEffect(() => {const onScroll = () => setShowTop(window.scrollY > 500);window.addEventListener('scroll', onScroll, { passive: true });return () => window.removeEventListener('scroll', onScroll);}, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || page !== 'discover') return;
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return;
      event.preventDefault();searchInput.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page]);
  useEffect(() => {setVisible(24);setRandom(null);}, [f]);
  useEffect(() => setRankVisible(30), [board]);
  useEffect(() => setCreatorVisible(24), [creatorQuery, creatorPlatform, creatorCategory, creatorFemale]);
  const videos = useMemo(() => data ? allVideos(data) : [], [data]);
  const creators = useMemo(() => data ? allCreators(data) : [], [data]);
  const types = useMemo(() => data ? categories(data) : ['全部类型'], [data]);
  const found = useMemo(() => filterVideos(videos, f), [videos, f]);
  const ranked = useMemo(() => data ? rankVideos(data, board) : [], [data, board]);
  const weekly = useMemo(() => data ? [...data.videos.bilibili].filter((v) => Date.parse(v.publishedAt) >= Date.parse(data.generatedAt) - 7 * 86400000).sort((a, b) => b.views - a.views).slice(0, 4) : [], [data]);
  const creatorResults = useMemo(() => filterCreators(creators, creatorQuery, creatorPlatform, creatorCategory, creatorFemale), [creators, creatorQuery, creatorPlatform, creatorCategory, creatorFemale]);
  const featuredCreators = useMemo(() => filterCreators(creators, '', 'all', '全部类型', false).slice(0, 4), [creators]);
  const videoMap = useMemo(() => new Map(videos.map((v) => [videoKey(v), v])), [videos]);
  const creatorMap = useMemo(() => new Map(creators.map((c) => [creatorKey(c), c])), [creators]);
  const works = useMemo(() => {const map = new Map<string, RankedVideo[]>();for (const v of videos) {const key = `${v.platform}:${v.creatorId}`;map.set(key, [...(map.get(key) || []), v]);}for (const items of map.values()) items.sort((a, b) => b.views - a.views);return map;}, [videos]);
  function setFilters(change: Partial<Filters>) {setLocal((p) => ({ ...p, filters: { ...p.filters, ...change } }));}
  function toggleVideo(v: RankedVideo) {const key = videoKey(v);setLocal((p) => ({ ...p, savedVideos: p.savedVideos.includes(key) ? p.savedVideos.filter((i) => i !== key) : [...p.savedVideos, key] }));}
  function toggleCreator(key: string) {setLocal((p) => ({ ...p, savedCreators: p.savedCreators.includes(key) ? p.savedCreators.filter((i) => i !== key) : [...p.savedCreators, key] }));}
  function openVideo(v: RankedVideo) {setLocal((p) => p.rememberRecent ? { ...p, recent: [{ key: videoKey(v), openedAt: new Date().toISOString() }, ...p.recent.filter((i) => i.key !== videoKey(v))].slice(0, 50) } : p);}
  async function restore(file?: File) {if (!file) return;try {const imported = await importState(file);setLanguage(imported.language);setLocal((previous) => ({ ...imported, savedVideos: [...new Set([...previous.savedVideos, ...imported.savedVideos])], savedCreators: [...new Set([...previous.savedCreators, ...imported.savedCreators])], recent: [...imported.recent, ...previous.recent.filter((item) => !imported.recent.some((old) => old.key === item.key))].slice(0, 50) }));setNotice(t('备份已导入，收藏与现有内容合并。'));} catch (e) {setNotice(t(e instanceof Error ? e.message : '导入失败。'));}if (fileInput.current) fileInput.current.value = '';}
  function changeLanguage() { const next = local.language === 'zh' ? 'en' : 'zh'; setLanguage(next); setLocal((previous) => ({ ...previous, language: next })); }
  const activeFilters = JSON.stringify(f) !== JSON.stringify(defaultFilters);
  const catalogOffset = activeFilters ? 0 : 4;
  const videoCard = (v: RankedVideo, mode: 'grid' | 'list' = 'grid', rank?: number) => <VideoCard key={videoKey(v)} video={v} mode={mode} rank={rank} saved={local.savedVideos.includes(videoKey(v))} onSave={() => toggleVideo(v)} onOpen={() => openVideo(v)} />;
  const creatorCard = (key: string) => {const c = creatorMap.get(key);return c ? <CreatorCard key={key} creator={c} works={works.get(key) || []} saved={local.savedCreators.includes(key)} onSave={() => toggleCreator(key)} onOpenVideo={openVideo} /> : <div className="missing-item" key={key}><strong>{key}</strong><p>{t("目前数据中找不到这位创作者，收藏记录仍已保留。")}</p><button onClick={() => toggleCreator(key)}>{t("删除记录")}</button></div>;};
  return <div className="site-shell">
    <a className="skip-link" href="#content">{t("跳转到内容")}</a>
    <header className="site-header"><div className="header-inner"><Brand /><nav className="desktop-nav" aria-label={t("主导航")}>{nav.map(({ key }) => <a href={`#/${key}`} key={key} className={page === key ? 'active' : ''} aria-current={page === key ? 'page' : undefined}>{t(pageNames[key])}</a>)}</nav><div className="header-right"><span>{t("双平台 ASMR 作品索引")}</span></div><button className="language-switch" type="button" onClick={changeLanguage} aria-label={local.language === 'zh' ? 'Switch to English' : '切换为中文'}>{local.language === 'zh' ? 'EN' : '中文'}</button></div></header>
    <main id="content" className="main-content">
      {loading && <div className="load-state"><span className="loading-line" />{t("正在读取内容索引…")}</div>}
      {!loading && loadError && <Empty title={t("暂时无法读取内容")} text={t("请检查网络连接，然后重新尝试。已有收藏仍保存在本机。")} action={<button className="button primary" onClick={() => setReload((n) => n + 1)}>{t("重新加载 ")}<ArrowRight size={16} /></button>} />}
      {!loading && !loadError && data && page === 'discover' && <>
        <div className="page-heading discover-heading"><div><h1>{t("ASMR 视频索引 ")}<span>Browse the collection</span></h1><p>{t("收录 YouTube 与哔哩哔哩的助眠作品。挑选声音，直接前往原平台。")}</p></div><span className="heading-count"><strong>{videos.length}</strong>{t(" 支作品 ")}<i>·</i> {creators.length}{t(" 位创作者")}</span></div>
        <div className="search-shell"><Search size={21} /><input ref={searchInput} type="search" value={f.query} onChange={(e) => setFilters({ query: e.target.value })} placeholder={t("搜索视频或创作者")} aria-label={t("搜索视频或创作者")} />{f.query && <button className="icon-button" aria-label={t("清空搜索")} onClick={() => setFilters({ query: '' })}><X size={18} /></button>}<kbd>/</kbd></div>
        <div className="filter-main"><div className="platform-switch" role="group" aria-label={t("平台筛选")}>{([['all', '全部平台'], ['bilibili', '哔哩哔哩'], ['youtube', 'YouTube']] as const).map(([key, label]) => <button key={key} className={f.platform === key ? 'selected' : ''} aria-pressed={f.platform === key} onClick={() => setFilters({ platform: key })}>{t(label)}</button>)}</div><div className="category-scroll">{types.map((type) => <button key={type} className={f.category === type ? 'selected' : ''} aria-pressed={f.category === type} onClick={() => setFilters({ category: type })}>{t(type)}</button>)}</div></div>
        <div className="tools-row"><div className="advanced-filters"><Select label={t("时长")} value={f.duration} onChange={(v) => setFilters({ duration: v as Filters['duration'] })} options={durationOptions} /><Select label={t("发布时间")} value={f.period} onChange={(v) => setFilters({ period: v as Filters['period'] })} options={periodOptions} /><label className="female-filter"><input type="checkbox" checked={f.femaleOnly} onChange={(e) => setFilters({ femaleOnly: e.target.checked })} /><span>{t("只看小姐姐")}</span></label></div><button className="mobile-filter-button" onClick={() => setDrawer(true)}><SlidersHorizontal size={17} />{t("更多筛选")}</button><div className="tool-actions"><Select label={t("排序")} value={f.sort} onChange={(v) => setFilters({ sort: v as Filters['sort'] })} options={sortOptions} /><button className="text-button" onClick={() => setRandom(found.length ? found[Math.floor(Math.random() * found.length)] : null)}><Shuffle size={16} />{t("随机发现")}</button><div className="view-switch" role="group" aria-label={t("显示模式")}><button className={local.display === 'grid' ? 'selected' : ''} aria-label={t("网格显示")} aria-pressed={local.display === 'grid'} onClick={() => setLocal((p) => ({ ...p, display: 'grid' }))}><Grid2X2 size={17} /></button><button className={local.display === 'list' ? 'selected' : ''} aria-label={t("列表显示")} aria-pressed={local.display === 'list'} onClick={() => setLocal((p) => ({ ...p, display: 'list' }))}><List size={18} /></button></div></div></div>
        {random && <div className="random-result"><span>{t("随机发现 / 当前筛选")}</span><strong>{random.title}</strong>{safeExternalUrl(random.url, random.platform, 'video') && <a href={safeExternalUrl(random.url, random.platform, 'video')!} target="_blank" rel="noopener noreferrer" onClick={() => openVideo(random)}>{t("前往原视频 ")}<ArrowRight size={16} /></a>}<button className="icon-button" aria-label={t("关闭随机发现")} onClick={() => setRandom(null)}><X size={18} /></button></div>}
        {!activeFilters && <><section className="shop-section arrivals"><div className="section-heading"><div><h2>{t("新近发布 ")}<small>New Arrivals</small></h2><p>{t("按原平台发布时间整理")}</p></div></div><div className="video-grid">{found.slice(0, 4).map((v) => videoCard(v))}</div></section><div className="editorial-split"><section className="shop-section"><div className="section-heading"><div><h2>{t("本周热门 ")}<small>Weekly Chart</small></h2><p>{t("B站近 7 天发布 · 按公开播放量排列")}</p></div><a href="#/rankings">{t("更多榜单 ")}<ArrowRight size={15} /></a></div><div className="weekly-list">{weekly.map((v, i) => videoCard(v, 'list', i + 1))}</div></section><section className="shop-section artists-section"><div className="section-heading"><div><h2>{t("创作者目录 ")}<small>Artists</small></h2><p>{t("从已收录作品认识创作者")}</p></div><a href="#/creators">{t("浏览全部 ")}<ArrowRight size={15} /></a></div><div className="artist-list">{featuredCreators.map((c) => <div className="artist-entry" key={creatorKey(c)}><span className="artist-avatar">{c.avatar ? <img src={c.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" /> : c.name.slice(0, 1)}</span><span><strong>{c.name}</strong><small>{t(platformName[c.platform])} · {works.get(creatorKey(c))?.length || 0}{t(" 支作品")}</small></span><a href={safeExternalUrl(c.url, c.platform, 'creator') || undefined} target="_blank" rel="noopener noreferrer" aria-label={`前往 ${c.name} 的原平台主页`}><ArrowRight size={16} /></a></div>)}</div></section></div></>}
        <div className="results-heading"><div><h2>{t("作品目录 ")}<span>{found.length}</span></h2><p>{t(activeFilters ? '当前筛选条件已应用' : '按发布时间浏览其余作品')}{t(" · 数据更新于 ")}{formatDate(data.generatedAt)}</p></div>{activeFilters && <button className="clear-button" onClick={() => setFilters(defaultFilters)}>{t("清除筛选 ")}<X size={15} /></button>}</div>
        {found.length ? <><div className={`video-grid ${local.display === 'list' ? 'is-list' : ''}`}>{found.slice(catalogOffset, visible + catalogOffset).map((v) => videoCard(v, local.display))}</div>{visible + catalogOffset < found.length && <button className="more-button" onClick={() => setVisible((n) => n + 24)}>{t("显示更多 ")}<span>{Math.min(24, found.length - visible - catalogOffset)}{t(" 支")}</span><ArrowRight size={16} /></button>}</> : <Empty title={t("没有匹配的作品")} text={t("试试其他关键词，或清除部分筛选条件。")} action={<button className="button" onClick={() => setFilters(defaultFilters)}>{t("清除筛选")}</button>} />}
      </>}
      {!loading && !loadError && data && page === 'rankings' && <><div className="page-heading"><div><span className="eyebrow">HUSH INDEX / RANKINGS</span><h1>{t("助眠内容榜单")}</h1><p>{t("用已有公开数据梳理值得听的作品。")}</p></div></div><div className="board-tabs" role="tablist" aria-label={t("选择榜单")}>{boards.map((item) => <button role="tab" aria-selected={board === item.key} key={item.key} className={board === item.key ? 'selected' : ''} onClick={() => setBoard(item.key)}>{t(item.label)}</button>)}</div><div className="board-intro"><div><h2>{t(boards.find((item) => item.key === board)?.label || "")}</h2><p>{t(boards.find((item) => item.key === board)?.note || "")} · {ranked.length}{t(" 支入榜")}</p></div><a href="#/about">{t("查看榜单口径 ")}<ArrowRight size={15} /></a></div>{board === 'rising' && ranked.some((v) => !v.scores?.hasSevenDaySnapshot) && <p className="data-note">{t("部分作品暂无完整七日快照，沿用既有算法的中性增速值；不展示虚构的排名变动。")}</p>}{ranked.length ? <><div className="ranking-list">{ranked.slice(0, rankVisible).map((v, i) => videoCard(v, 'list', i + 1))}</div>{rankVisible < ranked.length && <button className="more-button" onClick={() => setRankVisible((n) => n + 30)}>{t("显示更多 ")}<ArrowRight size={16} /></button>}</> : <Empty title={t("暂无符合条件的作品")} text={t("等待真实数据与快照更新后，榜单会自动显示。")} />}</>}
      {!loading && !loadError && data && page === 'creators' && <><div className="page-heading"><div><span className="eyebrow">HUSH INDEX / CREATORS</span><h1>{t("创作者目录")}</h1><p>{t("找到熟悉的声音，再从代表作品开始。")}</p></div><span className="heading-count"><strong>{creators.length}</strong>{t(" 位已收录")}</span></div><div className="creator-tools"><label className="creator-search"><Search size={18} /><input value={creatorQuery} onChange={(e) => setCreatorQuery(e.target.value)} placeholder={t("搜索创作者")} aria-label={t("搜索创作者")} /></label><Select label={t("平台")} value={creatorPlatform} onChange={(v) => setCreatorPlatform(v as Scope)} options={[['all', '全部平台'], ['bilibili', '哔哩哔哩'], ['youtube', 'YouTube']]} /><Select label={t("类型")} value={creatorCategory} onChange={setCreatorCategory} options={types.map((t) => [t, t])} /><label className="female-filter"><input type="checkbox" checked={creatorFemale} onChange={(e) => setCreatorFemale(e.target.checked)} /><span>{t("只看小姐姐")}</span></label></div><div className="results-heading"><div><h2>{t("创作者 ")}<span>{creatorResults.length}</span></h2><p>{t("按公开粉丝或订阅数排序")}</p></div></div>{creatorResults.length ? <><div className="creator-grid">{creatorResults.slice(0, creatorVisible).map((c) => creatorCard(creatorKey(c)))}</div>{creatorVisible < creatorResults.length && <button className="more-button" onClick={() => setCreatorVisible((n) => n + 24)}>{t("显示更多 ")}<ArrowRight size={16} /></button>}</> : <Empty title={t("没有匹配的创作者")} text={t("请尝试其他名字或筛选条件。")} />}</>}
      {!loading && !loadError && data && page === 'saved' && <><div className="page-heading"><div><span className="eyebrow">HUSH INDEX / SAVED</span><h1>{t("留给下次的声音")}</h1><p>{t("收藏与访问记录只保存在这台设备的浏览器中。")}</p></div></div><div className="saved-tabs" role="tablist" aria-label={t("收藏分类")}>{([['videos', '视频', local.savedVideos.length], ['creators', '创作者', local.savedCreators.length], ['recent', '最近访问', local.recent.length]] as const).map(([key, label, count]) => <button role="tab" aria-selected={savedTab === key} key={key} className={savedTab === key ? 'selected' : ''} onClick={() => setSavedTab(key)}>{t(label)} <span>{count}</span></button>)}</div>
        {savedTab === 'videos' && (local.savedVideos.length ? <div className="video-grid">{local.savedVideos.map((key) => {const v = videoMap.get(key);return v ? videoCard(v) : <div className="missing-item" key={key}><strong>{key}</strong><p>{t("目前数据中找不到这支视频，收藏记录仍已保留。")}</p><button onClick={() => setLocal((p) => ({ ...p, savedVideos: p.savedVideos.filter((i) => i !== key) }))}>{t("删除记录")}</button></div>;})}</div> : <Empty title={t("还没有收藏视频")} text={t("在发现或榜单页点击书签图标，就能把视频留在这里。")} action={<a className="button" href="#/discover">{t("去发现作品 ")}<ArrowRight size={16} /></a>} />)}
        {savedTab === 'creators' && (local.savedCreators.length ? <div className="creator-grid">{local.savedCreators.map(creatorCard)}</div> : <Empty title={t("还没有收藏创作者")} text={t("在创作者目录点击书签图标，即可快速找到他们。")} action={<a className="button" href="#/creators">{t("浏览创作者 ")}<ArrowRight size={16} /></a>} />)}
        {savedTab === 'recent' && <><div className="recent-controls"><label className="female-filter"><input type="checkbox" checked={local.rememberRecent} onChange={(e) => setLocal((p) => ({ ...p, rememberRecent: e.target.checked }))} /><span>{t("记录我打开的原视频")}</span></label>{local.recent.length > 0 && <button className="clear-button" onClick={() => setLocal((p) => ({ ...p, recent: [] }))}><Trash2 size={16} />{t("清空访问记录")}</button>}</div>{local.recent.length ? <div className="recent-list">{local.recent.map((item) => {const v = videoMap.get(item.key);const href = v && safeExternalUrl(v.url, v.platform, 'video');return <div className="recent-item" key={item.key}>{v ? <>{href ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => openVideo(v)}>{v.title}</a> : <strong>{v.title}</strong>}<small>{t(platformName[v.platform])}{t(" · 最近打开 ")}{formatDate(item.openedAt)}</small></> : <><strong>{item.key}</strong><small>{t("当前资源库中未找到")}</small></>}<button className="icon-button" aria-label={t("删除访问记录")} onClick={() => setLocal((p) => ({ ...p, recent: p.recent.filter((i) => i.key !== item.key) }))}><X size={17} /></button></div>;})}</div> : <Empty title={t("还没有访问记录")} text={t("你主动打开原平台视频后，这里会记录最近打开的链接。")} />}</>}
        <div className="backup-panel"><div><h2>{t("本地数据备份")}</h2><p>{t("导出 JSON 可在其他设备恢复收藏。清除浏览器数据可能导致本机收藏丢失。")}</p></div><div className="backup-actions"><button className="button" onClick={() => exportState(local)}><Download size={16} />{t("导出备份")}</button><button className="button" onClick={() => fileInput.current?.click()}><Upload size={16} />{t("导入备份")}</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} /></div></div>
      </>}
      {page === 'about' && <><div className="page-heading"><div><span className="eyebrow">HUSH INDEX / ABOUT</span><h1>{t("关于静响榜")}</h1><p>{t("一个把你带往原平台的 ASMR 内容索引。")}</p></div></div><div className="about-grid"><section><h2>{t("内容怎样入选")}</h2><p>{t("聚合 YouTube 与哔哩哔哩的公开资料，经自动清洗规则过滤非助眠内容与三分钟以下的视频。分类与“小姐姐频道”仅依据现有数据标注。")}</p></section><section><h2>{t("榜单怎么算")}</h2><p>{t("B站热榜：0.35 播放 + 0.25 点赞率 + 0.20 收藏率 + 0.20 七日增速，乘以发布时间衰减。上升榜仅收录近 30 天作品：0.70 增速 + 0.15 点赞率 + 0.15 收藏率。长尾榜仅收录超过 30 天作品：0.45 收藏率 + 0.30 点赞率 + 0.25 播放。各分项按候选集归一化；缺少七日快照时增速取 0.5。")}</p><p>{t("YouTube 热门与 B站热门按公开播放量排序。")}</p></section><section><h2>{t("数据与隐私")}</h2><p>{t("本站不提供播放、账号或评论。收藏、筛选偏好及最近访问记录存在浏览器本地，可导入导出。数据更新时间是整份索引的更新时刻，不代表每支视频的收录时间。")}</p></section><section><h2>{t("来源与归属")}</h2><p>{t("视频、封面和创作者信息归原平台及权利人所有。静响榜与 YouTube、哔哩哔哩均无官方关联；平台数据可能有延迟或受访问限制。")}</p><a href="https://github.com/YanLvLab/asmr-rankings" target="_blank" rel="noopener noreferrer">{t("查看 GitHub 项目 ")}<ArrowRight size={16} /></a></section></div></>}
    </main>
    <footer className="site-footer"><div><Brand /><p>{t("安静地发现，然后回到原平台聆听。")}</p>{data && <p className="footer-status">YouTube {formatDate(data.sources.youtube.updatedAt)}{data.sources.youtube.status !== 'live' ? t(' · 暂未更新') : ''}{t("\u3000/\u3000哔哩哔哩 ")}{formatDate(data.sources.bilibili.updatedAt)}{data.sources.bilibili.status !== 'live' ? t(' · 暂未更新') : ''}</p>}</div><div className="footer-links"><a href="#/about">{t("方法与说明")}</a><a href={`${import.meta.env.BASE_URL}privacy.html?lang=${local.language}`}>{t("隐私说明")}</a><a href="https://github.com/YanLvLab/asmr-rankings" target="_blank" rel="noopener noreferrer">GitHub</a><span>{t("与两平台官方无关")}</span></div></footer>
    {showTop && <button className="back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label={t("返回顶部")}><ArrowUp size={19} /></button>}
    <nav className="mobile-nav" aria-label={t("移动端主导航")}>{nav.map(({ key, icon: Icon }) => <a href={`#/${key}`} key={key} className={page === key ? 'active' : ''} aria-current={page === key ? 'page' : undefined}><Icon size={20} /><span>{t(pageNames[key])}</span></a>)}</nav>
    {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)}><section className="filter-drawer" onClick={(e) => e.stopPropagation()} aria-label={t("更多筛选")}><div className="drawer-title"><h2>{t("更多筛选")}</h2><button className="icon-button" onClick={() => setDrawer(false)} aria-label={t("关闭筛选")}><X size={21} /></button></div><Select label={t("时长")} value={f.duration} onChange={(v) => setFilters({ duration: v as Filters['duration'] })} options={durationOptions} /><Select label={t("发布时间")} value={f.period} onChange={(v) => setFilters({ period: v as Filters['period'] })} options={periodOptions} /><Select label={t("排序")} value={f.sort} onChange={(v) => setFilters({ sort: v as Filters['sort'] })} options={sortOptions} /><label className="female-filter"><input type="checkbox" checked={f.femaleOnly} onChange={(e) => setFilters({ femaleOnly: e.target.checked })} /><span>{t("只看小姐姐")}</span></label><button className="button primary" onClick={() => setDrawer(false)}>{t("查看 ")}{found.length}{t(" 支作品")}</button></section></div>}
    {notice && <div className="toast" role="status">{notice}<button className="icon-button" aria-label={t("关闭提示")} onClick={() => setNotice('')}><X size={16} /></button></div>}
  </div>;
}
