import type { Memory } from "./types.ts";

const STOP = new Set(["the", "a", "an", "and", "to", "of", "at", "in", "on", "for", "with", "is", "was", "it", "she", "he", "they", "i", "me", "my", "her", "his"]);
function keywords(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-zà-ž0-9 ]/gi, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

/** Retrieval by recency, importance, and relevance, the Generative Agents recipe without embeddings. */
export function retrieve(memories: Memory[], query: string, now: number, n = 8): Memory[] {
  const q = keywords(query);
  const scored = memories.map((m) => {
    const ageHours = Math.max(0, (now - m.t) / 60);
    const recency = Math.exp(-ageHours / 48);
    const kw = keywords(m.text);
    let overlap = 0;
    for (const w of q) if (kw.has(w)) overlap++;
    const relevance = q.size ? overlap / q.size : 0;
    return { m, score: 0.35 * recency + 0.35 * m.importance + 0.3 * relevance };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, n).map((x) => x.m);
}

/** Nightly: keep the important, drop the rest, cap the stream. */
export function compress(memories: Memory[], cap = 240): Memory[] {
  if (memories.length <= cap) return memories;
  const sorted = [...memories].sort((a, b) => (b.importance - a.importance) || (b.t - a.t));
  const kept = sorted.slice(0, cap);
  kept.sort((a, b) => a.t - b.t);
  return kept;
}
