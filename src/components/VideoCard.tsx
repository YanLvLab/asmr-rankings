import { t } from "../lib/i18n";import { useState } from 'react';
import { ArrowUpRight, Bookmark, ImageOff } from 'lucide-react';
import type { RankedVideo } from '../types';
import { formatDuration, formatNumber, platformName, safeExternalUrl } from '../lib/catalog';

export default function VideoCard({ video, saved, onSave, onOpen, mode = 'grid', rank }: {video: RankedVideo;saved: boolean;onSave: () => void;onOpen: () => void;mode?: 'grid' | 'list';rank?: number;}) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = safeExternalUrl(video.url, video.platform, 'video');
  const opener = href ? { href, target: '_blank', rel: 'noopener noreferrer', onClick: onOpen } : {};
  return <article className={`video-card ${mode === 'list' ? 'video-card-list' : ''}`}>
    {rank != null && <span className="video-rank">{String(rank).padStart(2, '0')}</span>}
    <a className="video-cover" {...opener} aria-label={href ? `${t('前往原平台观看')}: ${video.title}` : t('原视频链接不可用')}>
      {video.thumbnail && !imageFailed ? <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <span className="image-placeholder"><ImageOff size={24} />{t("暂无封面")}</span>}
      <span className="cover-platform">{t(platformName[video.platform])}</span>
      {video.durationSeconds > 0 && <span className="cover-duration">{formatDuration(video.durationSeconds)}</span>}
    </a>
    <div className="video-info">
      <div className="video-title-row"><h3><a {...opener}>{video.title}</a></h3><button className={`icon-button save-button ${saved ? 'is-saved' : ''}`} type="button" onClick={onSave} aria-label={`${t(saved ? '取消收藏' : '加入收藏')} ${video.title}`} aria-pressed={saved} title={t(saved ? '取消收藏' : '加入收藏')}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button></div>
      <p className="video-creator">{video.creatorName}</p>
      <div className="video-meta"><span>{formatNumber(video.views)}{t(" 播放")}</span>{video.categories[0] && <span>{t(video.categories[0])}</span>}<a {...opener} aria-label={`${t('打开')} ${video.title}`} className="open-link"><ArrowUpRight size={17} /></a></div>
    </div>
  </article>;
}
