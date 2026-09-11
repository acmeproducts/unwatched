import { GITHUB_REPO, GITHUB_URL } from "@/lib/site";

/** The repository's stars, fetched on the server and kept for an hour; the pill still renders when GitHub is not answering. */
async function stars(): Promise<number | null> {
  try { const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { next: { revalidate: 3600 }, headers: { accept: "application/vnd.github+json", "user-agent": "unwatched.world" } }); if (!r.ok) return null; const j = (await r.json()) as { stargazers_count?: number }; return typeof j.stargazers_count === "number" ? j.stargazers_count : null; }
  catch { return null; }
}
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
function Mark({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>; }
function Star({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" /></svg>; }

/** A link to the repository that carries its star count: compact in a header, a full button elsewhere. */
export async function GitHubStars({ variant = "button" }: { variant?: "compact" | "button" }) {
  const n = await stars();
  if (variant === "compact") return <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 hover:text-kelp transition-colors" aria-label={n === null ? "Unwatched on GitHub" : `Unwatched on GitHub, ${n} stars`}><Mark /> GitHub{n !== null && <span className="inline-flex items-center gap-1 text-[13px] font-bold text-kelp bg-glass rounded-[6px] px-1.5 py-0.5"><Star size={11} />{fmt(n)}</span>}</a>;
  return <a href={GITHUB_URL} className="h-12 pl-4 pr-1.5 rounded-[8px] border-[1.5px] border-[rgba(247,246,243,0.3)] text-kelp font-bold text-[15px] inline-flex items-center gap-2.5 hover:border-kelp transition-colors" aria-label={n === null ? "Star Unwatched on GitHub" : `Star Unwatched on GitHub, ${n} stars so far`}><Mark size={18} /> Star on GitHub<span className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[6px] bg-glass text-[14px]"><Star />{n === null ? "" : fmt(n)}</span></a>;
}
