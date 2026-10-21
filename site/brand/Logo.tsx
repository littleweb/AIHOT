// 站点的字标和圆环标记：页面用 Wordmark 画站名（size 是高度，单位像素），RingMark 是小标记，转起来就是加载动画。
// 用户选定的 A「神灯火花」：小尺寸矢量标记与站名字标。
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap font-black leading-none tracking-[-0.03em] ${className}`} style={{ fontSize: Math.round(size * 0.72) }} aria-label={title} role="img">
      <svg viewBox="0 0 68 64" width={size + 4} height={size} className="mr-[0.3em] shrink-0 text-accent" aria-hidden="true"><path d="M18 30C30 39 45 38 60 25C52 27 45 27 38 30C29 34 24 26 16 25C5 23 2 28 4 34C6 39 15 38 19 43C18 37 8 37 8 32C8 28 12 27 18 30ZM20 35C25 42 30 43 33 46L31 49C26 50 22 52 21 55H47C46 52 42 50 37 49L36 46C41 41 44 36 47 33C38 37 28 39 20 35ZM26 27C31 26 32 22 36 21C35 17 39 17 40 20C41 22 42 24 45 25C38 28 32 29 26 27Z" fill="currentColor" /><path d="M56 8C56 14 58 16 64 18C58 19 56 22 56 28C55 22 52 20 47 18C52 17 55 14 56 8Z" fill="#dfa536" /></svg>
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
