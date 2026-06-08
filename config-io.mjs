#!/usr/bin/env node
// config-io.mjs — read/write the user-layer profile for the dashboard Settings page.
// The dashboard never edits config files directly — it spawns this (backup-safe), same
// pattern as set-status.mjs / scan.mjs / jd-fetch.mjs.
//
//   node config-io.mjs read               → JSON { ok, profile, profileMd }
//   node config-io.mjs write <file.json>  → applies { profile?: <partial, deep-merged>,
//                                            profileMd?: <full replace> }; backs up to *.bak

import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PROFILE_YML = join(ROOT, "config", "profile.yml");
const PROFILE_MD = join(ROOT, "modes", "_profile.md");

const out = (o) => console.log(JSON.stringify(o));

function read() {
  const profile = existsSync(PROFILE_YML) ? yaml.load(readFileSync(PROFILE_YML, "utf8")) || {} : {};
  const profileMd = existsSync(PROFILE_MD) ? readFileSync(PROFILE_MD, "utf8") : "";
  out({ ok: true, profile, profileMd });
}

// Deep-merge a partial patch into base: objects merge, arrays + scalars replace.
function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch;
  if (patch && typeof patch === "object") {
    const r = base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};
    for (const k of Object.keys(patch)) r[k] = deepMerge(r[k], patch[k]);
    return r;
  }
  return patch;
}

function write(file) {
  let updates;
  try {
    updates = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return out({ ok: false, error: `bad updates file: ${e.message}` });
  }

  if (updates.profile && typeof updates.profile === "object") {
    const cur = existsSync(PROFILE_YML) ? yaml.load(readFileSync(PROFILE_YML, "utf8")) || {} : {};
    const merged = deepMerge(cur, updates.profile);
    if (existsSync(PROFILE_YML)) copyFileSync(PROFILE_YML, PROFILE_YML + ".bak");
    writeFileSync(PROFILE_YML, yaml.dump(merged, { lineWidth: 100, noRefs: true }));
  }

  if (typeof updates.profileMd === "string") {
    if (existsSync(PROFILE_MD)) copyFileSync(PROFILE_MD, PROFILE_MD + ".bak");
    writeFileSync(PROFILE_MD, updates.profileMd);
  }

  try {
    unlinkSync(file);
  } catch {
    /* temp cleanup best-effort */
  }
  out({ ok: true });
}

const cmd = process.argv[2];
if (cmd === "read") read();
else if (cmd === "write" && process.argv[3]) write(process.argv[3]);
else out({ ok: false, error: "usage: config-io.mjs read | write <file.json>" });
