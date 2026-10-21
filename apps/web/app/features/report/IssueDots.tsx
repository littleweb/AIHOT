// Native period links keep the issue calendar readable and usable before hydration,
// and in the exported static site. Only published issues are navigable.
import { Link } from "react-router";
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { KIND_PATH, periodGrid } from "./format";

export function IssueDots({ kind, reportKey, issueNumber, index, className = "" }: { kind: ReportKind; reportKey: string; issueNumber: number; index: ReportNavigationEntry[]; className?: string }) {
  const grid = periodGrid(kind, reportKey, index, issueNumber);
  return (
    <nav aria-label={`${grid.title}出刊日历`} className={className}>
      <div className="flex items-baseline justify-between text-[11px] text-ink-4">
        <span className="font-semibold tracking-[0.2em] text-ink-2">{grid.title}</span>
        <span className="num">{grid.note}</span>
      </div>
      {grid.heads && (
        <div className="mt-2 grid text-center text-[10px] leading-none text-ink-4" style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))` }}>
          {grid.heads.map((h) => <span key={h}>{h}</span>)}
        </div>
      )}
      <div className="num mt-1 grid text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))` }}>
        {grid.cells.map((cell, i) => {
          if (cell.state === "pad") return <span key={`pad-${i}`} aria-hidden="true" />;
          const number = Number(cell.key!.split(kind === "weekly" ? "W" : "-").at(-1));
          return cell.state === "issue" || cell.state === "current" ? (
            <Link key={cell.key} to={`${KIND_PATH[kind]}/${cell.key}`} title={cell.label} aria-label={cell.label} aria-current={cell.state === "current" ? "date" : undefined}
              className={`flex min-h-7 items-center justify-center rounded-full font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${cell.state === "current" ? "bg-accent text-bg" : "text-ink hover:bg-accent-soft hover:text-accent"}`}>
              {number}
            </Link>
          ) : (
            <span key={cell.key} title={cell.label} aria-label={cell.label} className="flex min-h-7 items-center justify-center text-ink-4">{number}</span>
          );
        })}
      </div>
    </nav>
  );
}
