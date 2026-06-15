// Pure FTS5 query construction — no DB / server-only imports, so it's unit
// testable. search.ts re-exports these for callers.

// Deterministic, zero-API "semantic-lite" expansion: common job-search acronyms
// and synonyms so a search for "pm" also finds "project manager", "ops" finds
// "operations", etc. Keys are the typed token; values are extra OR-alternatives.
const SYNONYMS: Record<string, string[]> = {
  pm: ["project manager", "program manager"],
  ba: ["business analyst"],
  pmo: ["project management office"],
  ops: ["operations"],
  ai: ["artificial intelligence", "machine learning"],
  ml: ["machine learning"],
  uat: ["user acceptance testing"],
  bi: ["business intelligence"],
  qa: ["quality assurance"],
  implementation: ["onboarding", "deployment", "rollout"],
  onboarding: ["implementation"],
  coordinator: ["associate", "specialist"],
  remote: ["distributed", "work from home"],
  nyc: ["new york"],
  comp: ["compensation"],
  exp: ["experience"],
};

const EXPANDABLE = new Set(Object.keys(SYNONYMS));

/** True if the query has any token we'd broaden — lets the UI note it. */
export function hasExpansion(raw: string): boolean {
  return String(raw || "")
    .toLowerCase()
    .split(/\s+/)
    .some((t) => EXPANDABLE.has(t.replace(/[^a-z0-9]/g, "")));
}

// Turn a free-text query into a safe FTS5 MATCH expression.
//  - "quoted phrases" are preserved as exact phrases (no expansion)
//  - bare words become prefix terms (foo → "foo"*), OR-grouped with any synonyms
//  - everything is quoted to neutralize FTS operator characters
//  - groups are AND-ed (every concept must appear), matching user expectation
// Returns "" when there's nothing searchable (caller then returns no rows).
export function toFtsQuery(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const parts: string[] = [];
  const phraseRe = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(text))) {
    const phrase = m[1].replace(/[^a-z0-9 ]/gi, " ").trim();
    if (phrase) parts.push(`"${phrase}"`);
  }
  const rest = text.replace(phraseRe, " ");
  for (const tok of rest.split(/\s+/)) {
    const clean = tok.replace(/[^a-z0-9#+.]/gi, "");
    if (clean.length < 2) continue;
    const alts = SYNONYMS[clean.toLowerCase()];
    if (alts && alts.length) {
      const group = [`"${clean}"*`, ...alts.map((a) => `"${a}"`)].join(" OR ");
      parts.push(`(${group})`);
    } else {
      parts.push(`"${clean}"*`);
    }
  }
  return parts.join(" AND ");
}
