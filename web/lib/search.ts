import "server-only";
import { sqlite, ftsAvailable } from "@/db";
import type { Job } from "./data";

// Turn a free-text query into a safe FTS5 MATCH expression.
//  - "quoted phrases" are preserved as phrases
//  - bare words become prefix terms (foo → "foo"*) so partial typing matches
//  - everything is quoted to neutralize FTS operator characters
//  - terms are AND-ed (every term must appear), matching user expectation
// Returns "" when there's nothing searchable (caller then returns no rows).
export function toFtsQuery(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const parts: string[] = [];
  const phraseRe = /"([^"]+)"/g;
  let rest = text;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(text))) {
    const phrase = m[1].replace(/[^a-z0-9 ]/gi, " ").trim();
    if (phrase) parts.push(`"${phrase}"`);
  }
  rest = text.replace(phraseRe, " ");
  for (const tok of rest.split(/\s+/)) {
    const clean = tok.replace(/[^a-z0-9#+.]/gi, "");
    if (clean.length >= 2) parts.push(`"${clean}"*`);
  }
  return parts.join(" AND ");
}

// Search the corpus (title + company + full JD body). Uses FTS5 when available,
// ranked by bm25 with title/company weighted above body; falls back to LIKE over
// the indexed columns + JD preview if the SQLite build lacks FTS5.
export function searchJobs(raw: string, limit = 200): Job[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (ftsAvailable) {
    const match = toFtsQuery(text);
    if (!match) return [];
    try {
      return sqlite
        .prepare(
          `SELECT j.* FROM jobs_fts f
             JOIN jobs j ON j.url = f.url
            WHERE jobs_fts MATCH ?
            ORDER BY bm25(jobs_fts, 0.0, 4.0, 3.0, 1.0)
            LIMIT ?`,
        )
        .all(match, limit) as Job[];
    } catch {
      /* malformed match → fall through to LIKE */
    }
  }

  const like = `%${text.replace(/[%_]/g, (c) => "\\" + c)}%`;
  return sqlite
    .prepare(
      `SELECT * FROM jobs
        WHERE title LIKE ? ESCAPE '\\'
           OR company LIKE ? ESCAPE '\\'
           OR description LIKE ? ESCAPE '\\'
        ORDER BY (posted='') ASC, posted DESC
        LIMIT ?`,
    )
    .all(like, like, like, limit) as Job[];
}
