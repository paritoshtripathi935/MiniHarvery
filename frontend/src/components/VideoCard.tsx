/**
 * Compact thumbnail card for a YouTube video — shown in the Videos strip
 * below the Sources panel. Click opens the video in a new tab.
 */
import { Play } from 'lucide-react';
import type { VideoResult } from '../types';

interface Props {
  video: VideoResult;
}

export default function VideoCard({ video }: Props) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg overflow-hidden border no-underline transition-all"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Thumbnail with play overlay */}
      <div className="relative aspect-video" style={{ backgroundColor: 'var(--bg)' }}>
        {video.thumbnail_url && (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Play size={14} fill="var(--bg)" style={{ color: 'var(--bg)', marginLeft: 2 }} />
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="p-2">
        <p
          className="text-[11px] font-medium line-clamp-2 leading-snug"
          style={{ color: 'var(--text-bright)' }}
        >
          {video.title}
        </p>
        <p
          className="text-[10px] mt-1 line-clamp-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {video.channel}
        </p>
      </div>
    </a>
  );
}
