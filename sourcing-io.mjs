#!/usr/bin/env node
// sourcing-io.mjs — read/write the user's SOURCING config (the JSearch saved
// searches + title/location filters in portals.yml) for the dashboard Discover
// page. The dashboard never edits portals.yml directly — it spawns this
// (backup-safe), same pattern as config-io.mjs / scan.mjs.
//
//   node sourcing-io.mjs read              → JSON { ok, searches, titleFilter, locationFilter, atsCount }
//   node sourcing-io.mjs write <file.json> → replaces the jsearch saved searches and
//                                            (if provided) title/location filters; keeps every
//                                            non-jsearch (ATS) tracked_company + seniority_boost.
//                                            Backs portals.yml up to portals.yml.bak.

import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORTALS = join(ROOT, "portals.yml");

const out = (o) => console.log(JSON.stringify(o));
const loadPortals = () => (existsSync(PORTALS) ? yaml.load(readFileSync(PORTALS, "utf8")) || {} : {});

// A jsearch tracked_companies entry ⇄ a UI "saved search".
function entryToSearch(e) {
  return {
    name: e.name || "",
    query: e.jsearch_query || "",
    datePosted: e.jsearch_date_posted || "week",
    numPages: e.jsearch_num_pages || 1,
    country: e.jsearch_country || "us",
    enabled: e.enabled !== false,
  };
}
function searchToEntry(s) {
  const e = {
    name: s.name || "JSearch saved search",
    provider: "jsearch",
    jsearch_query: String(s.query || "").trim(),
    jsearch_date_posted: s.datePosted || "week",
    enabled: s.enabled !== false,
  };
  if (s.numPages && Number(s.numPages) > 1) e.jsearch_num_pages = Number(s.numPages);
  if (s.country && s.country !== "us") e.jsearch_country = s.country;
  return e;
}

function read() {
  const c = loadPortals();
  const tc = Array.isArray(c.tracked_companies) ? c.tracked_companies : [];
  const searches = tc.filter((e) => e && e.provider === "jsearch" && e.jsearch_query).map(entryToSearch);
  const atsCount = tc.filter((e) => e && e.provider !== "jsearch").length;
  out({
    ok: true,
    searches,
    titleFilter: {
      positive: c.title_filter?.positive || [],
      negative: c.title_filter?.negative || [],
    },
    locationFilter: {
      allow: c.location_filter?.allow || [],
      block: c.location_filter?.block || [],
    },
    atsCount,
  });
}

function write(file) {
  let updates;
  try {
    updates = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return out({ ok: false, error: `bad updates file: ${e.message}` });
  }

  const c = loadPortals();
  const tc = Array.isArray(c.tracked_companies) ? c.tracked_companies : [];

  // Replace ONLY the jsearch entries; keep every ATS board untouched and in place.
  if (Array.isArray(updates.searches)) {
    const nonJsearch = tc.filter((e) => !(e && e.provider === "jsearch"));
    const jsearch = updates.searches
      .filter((s) => s && String(s.query || "").trim())
      .map(searchToEntry);
    c.tracked_companies = [...nonJsearch, ...jsearch];
  }

  // Update filters but PRESERVE seniority_boost and any other title_filter keys.
  if (updates.titleFilter && typeof updates.titleFilter === "object") {
    c.title_filter = c.title_filter || {};
    if (Array.isArray(updates.titleFilter.positive)) c.title_filter.positive = updates.titleFilter.positive;
    if (Array.isArray(updates.titleFilter.negative)) c.title_filter.negative = updates.titleFilter.negative;
  }
  if (updates.locationFilter && typeof updates.locationFilter === "object") {
    c.location_filter = c.location_filter || {};
    if (Array.isArray(updates.locationFilter.allow)) c.location_filter.allow = updates.locationFilter.allow;
    if (Array.isArray(updates.locationFilter.block)) c.location_filter.block = updates.locationFilter.block;
  }

  if (existsSync(PORTALS)) copyFileSync(PORTALS, PORTALS + ".bak");
  writeFileSync(PORTALS, yaml.dump(c, { lineWidth: 120, noRefs: true }));

  try {
    unlinkSync(file);
  } catch {
    /* best-effort temp cleanup */
  }
  out({ ok: true, searches: (c.tracked_companies || []).filter((e) => e.provider === "jsearch").length });
}

const cmd = process.argv[2];
if (cmd === "read") read();
else if (cmd === "write" && process.argv[3]) write(process.argv[3]);
else out({ ok: false, error: "usage: sourcing-io.mjs read | write <file.json>" });
