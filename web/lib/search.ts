import "server-only";
import { sqlite, ftsAvailable } from "@/db";
import type { Job } from "./data";
import { toFtsQuery, hasExpansion } from "./search-query";

// Re-export the pure query helpers so existing importers (search page) are
// unaffected; the construction logic lives in search-query.ts for unit testing.
export { toFtsQuery, hasExpansion };

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
