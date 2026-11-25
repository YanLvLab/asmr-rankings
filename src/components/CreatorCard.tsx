import { useState } from 'react'
import { ArrowUpRight, Bookmark } from 'lucide-react'
import type { RankedCreator, RankedVideo } from '../types'
import { formatNumber, platformName, safeExternalUrl } from '../lib/catalog'

export default function CreatorCard({ creator, works, saved, onSave, onOpenVideo }: { creator: RankedCreator; works: RankedVideo[]; saved: boolean; onSave: () => void; onOpenVideo: (video: RankedVideo) => void }) {
  const [avatarFailed, setAvatarFailed] = useState(false)
  const href = safeExternalUrl(creator.url, creator.platform, 'creator')
  const workHref = works[0] ? safeExternalUrl(works[0].url, works[0].platform, 'video') : null
  return <article className="creator-card">
    <div className="creator-head">
      <span className="creator-avatar">{creator.avatar && !avatarFailed ? <img src={creator.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : creator.name.slice(0, 1)}</span>
      <div className="creator-identity"><span className="creator-platform">{platformName[creator.platform]}</span><h3>{creator.name}</h3><p>{formatNumber(creator.followers)} {creator.platform === 'youtube' ? '订阅' : '粉丝'} · 已收录 {works.length} 支</p></div>
      <button className={`icon-button save-button ${saved ? 'is-saved' : ''}`} type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? `取消收藏 ${creator.name}` : `收藏 ${creator.name}`}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>
    </div>
    <p className="creator-tags">{creator.topCategories.slice(0, 3).join(' · ') || '助眠内容'}</p>
    {works[0] && workHref && <a className="creator-work" href={workHref} target="_blank" rel="noopener noreferrer" onClick={() => onOpenVideo(works[0])}><span>代表作品</span><strong>{works[0].title}</strong><ArrowUpRight size={16} /></a>}
    <div className="creator-actions">{href && <a href={href} target="_blank" rel="noopener noreferrer">前往原平台主页 <ArrowUpRight size={16} /></a>}<span>{creator.femaleHost ? '小姐姐频道' : ''}</span></div>
  </article>
}
