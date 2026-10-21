// 站点的字标和圆环标记：页面用 Wordmark 画站名（size 是高度，单位像素），RingMark 是小标记，转起来就是加载动画。
// 用户选定的 D「热点火花」：青绿光芒、金色灯焰与光点。
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap font-black leading-none tracking-[-0.03em] ${className}`} style={{ fontSize: Math.round(size * 0.72) }} aria-label={title} role="img">
      <svg viewBox="0 0 68 64" width={size + 4} height={size} className="mr-[0.3em] shrink-0 text-accent" aria-hidden="true"><path d="M32 5Q35 24 58 32Q37 36 32 59Q28 39 6 32Q26 26 32 5Z" fill="currentColor" /><path d="M33 23Q44 33 35 42Q39 32 29 32Q33 28 33 23Z" fill="#dca447" /><circle cx="55" cy="10" r="4" fill="#dca447" /></svg>
      <span aria-hidden="true">{SITE.name.split(/(AI)/).map((part, index) => <span key={index} className={part === "AI" ? "text-accent" : undefined}>{part}</span>)}</span>
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
