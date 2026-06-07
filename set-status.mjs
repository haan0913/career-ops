#!/usr/bin/env node
// set-status.mjs — set ONE application's status in applications.md, canonical-validated
// and backup-safe. Used by the web dashboard's status dropdown (write-back path).
// The dashboard never edits markdown directly — it spawns this so the engine owns the
// file mutation (same pattern as scan.mjs / match-score.mjs / jd-fetch.mjs).
//
//   node set-status.mjs <number> <status>   → prints JSON {ok, number, oldStatus, newStatus}

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPS = existsSync(join(ROOT, "data/applications.md"))
  ? join(ROOT, "data/applications.md")
  : join(ROOT, "applications.md");

// Canonical states (templates/states.yml). The status column must be exactly one.
const CANON = ["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"];

const out = (o) => console.log(JSON.stringify(o));

function canonical(s) {
  const t = String(s || "").replace(/\*\*/g, "").trim().toLowerCase();
  return CANON.find((c) => c.toLowerCase() === t) || null;
}

function main() {
  const num = parseInt(process.argv[2], 10);
  const status = canonical(process.argv[3]);
  if (!Number.isInteger(num)) return out({ ok: false, error: "invalid application number" });
  if (!status) return out({ ok: false, error: `invalid status — use one of: ${CANON.join(", ")}` });
  if (!existsSync(APPS)) return out({ ok: false, error: "applications.md not found" });

  const lines = readFileSync(APPS, "utf-8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    const parts = line.split("|").map((s) => s.trim());
    // | # | date | company | role | score | STATUS | pdf | report | notes |
    if (parts.length < 9) continue;
    if (parseInt(parts[1], 10) !== num) continue;

    const oldStatus = parts[6];
    if (oldStatus === status) return out({ ok: true, number: num, oldStatus, newStatus: status, unchanged: true });

    parts[6] = status;
    lines[i] = "| " + parts.slice(1, -1).join(" | ") + " |";
    copyFileSync(APPS, APPS + ".bak");
    writeFileSync(APPS, lines.join("\n"));
    return out({ ok: true, number: num, oldStatus, newStatus: status });
  }
  return out({ ok: false, error: `application #${num} not found` });
}

main();
