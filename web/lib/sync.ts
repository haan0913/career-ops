import "server-only";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { DATA } from "./paths";
import { sqlite } from "@/db";

// IMPORT: parse the career-ops markdown/TSV files into the SQLite projection.
// (EXPORT — writing edits back via batch/tracker-additions + merge-tracker.mjs —
//  lands in a later step; for now the dashboard is read-mostly.)
export function syncAll() {
  syncApplications();
  syncPipeline();
}

function syncApplications() {
  const f = path.join(DATA, "applications.md");
  if (!existsSync(f)) return;
  sqlite.exec("DELETE FROM applications");
  const ins = sqlite.prepare(
    "INSERT INTO applications (number,date,company,role,score,status,pdf,report,notes) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    if (!/^\|\s*\d/.test(line)) continue; // data rows: | <num> | date | company | ...
    const c = line.split("|").map((s) => s.trim());
    const num = Number(c[1]);
    if (!num) continue;
    ins.run(num, c[2] ?? "", c[3] ?? "", c[4] ?? "", c[5] ?? "", c[6] ?? "", c[7] ?? "", c[8] ?? "", c[9] ?? "");
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// url -> {location, source} from scan-history.tsv — the richer per-URL record
// (cols: url, first_seen, portal, title, company, status, location).
function scanHistoryMeta(): Map<string, { location: string; source: string }> {
  const f = path.join(DATA, "scan-history.tsv");
  const map = new Map<string, { location: string; source: string }>();
  if (!existsSync(f)) return map;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split("\t");
    if (!c[0]) continue;
    map.set(c[0].trim(), {
      location: (c[6] ?? "").trim(),
      source: (c[2] ?? "").trim().replace(/-api$/, ""),
    });
  }
  return map;
}

function syncPipeline() {
  const f = path.join(DATA, "pipeline.md");
  if (!existsSync(f)) return;
  sqlite.exec("DELETE FROM jobs");
  const meta = scanHistoryMeta();
  const ins = sqlite.prepare(
    "INSERT OR IGNORE INTO jobs (url,company,title,posted,state,report_num,score,location,source) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const l of readFileSync(f, "utf-8").split("\n")) {
    // Pending:  - [ ] url | company | title | posted YYYY-MM-DD
    let m = l.match(/^- \[ \] (\S+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*(?:\|\s*posted\s*(\S+))?\s*$/);
    if (m) {
      const md = meta.get(m[1]) || { location: "", source: "" };
      ins.run(m[1], m[2], m[3], m[4] ?? "", "pending", null, null, md.location, md.source || domainOf(m[1]));
      continue;
    }
    // Processed: - [x] #NNN | url | company | role | score/5 | PDF ...
    m = l.match(/^- \[x\] #(\d+)\s*\|\s*(\S+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([\d.]+\/5|N\/A)/i);
    if (m) {
      const md = meta.get(m[2]) || { location: "", source: "" };
      ins.run(m[2], m[3], m[4], "", "processed", Number(m[1]), m[5], md.location, md.source || domainOf(m[2]));
      continue;
    }
  }
}
