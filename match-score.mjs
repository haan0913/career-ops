#!/usr/bin/env node

/**
 * match-score.mjs — local, zero-cost JD↔CV match score (0–100) + matched/missing keywords.
 *
 * A cheap PRE-FILTER to triage/rank roles BEFORE the LLM A–F evaluation. NOT a hiring
 * verdict — keyword/semantic similarity overstates fit and is gameable; the LLM eval
 * stays the judge. It surfaces only keywords genuinely present in the CV (never invents).
 *
 * Scoring:
 *   semantic — @huggingface/transformers (Xenova/all-MiniLM-L6-v2, 384-dim, FULLY OFFLINE):
 *              cosine similarity between mean-pooled CV and JD embeddings, with 256-token
 *              chunking (the model truncates >256 word-pieces).
 *   lexical  — share of the JD's salient terms present in the CV.
 *   blended  — round(100 * (0.6*semantic + 0.4*lexical)). Treat as a RELATIVE ranking signal.
 *
 * If @huggingface/transformers isn't installed (or the model can't load offline) it
 * gracefully falls back to a lexical-only score and labels the mode.
 *
 * Usage:
 *   node match-score.mjs <jd-file>             # score a JD file vs cv.md
 *   node match-score.mjs --jd "JD text..."     # inline JD text
 *   echo "JD text" | node match-score.mjs      # JD from stdin
 *   node match-score.mjs --cv resume.md <jd-file>
 *   node match-score.mjs --json <jd-file>      # machine-readable output
 *
 * Programmatic:  import { matchScore } from './match-score.mjs'
 */

import { readFileSync, existsSync } from 'fs';

const W_SEM = 0.6;
const W_LEX = 0.4;
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const MAX_WORDS = 180; // ~250 word-pieces; MiniLM truncates beyond 256

// ── Semantic embeddings (lazy + graceful) ───────────────────────────────────
let _extractor;
let _embedOk = null; // null=untried, true=available, false=unavailable
async function getExtractor() {
  if (_embedOk === false) return null;
  if (_extractor) return _extractor;
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    if (env) env.allowRemoteModels = env.allowRemoteModels ?? true; // download once, then cached
    _extractor = await pipeline('feature-extraction', MODEL);
    _embedOk = true;
    return _extractor;
  } catch {
    _embedOk = false;
    return null;
  }
}

export function chunkWords(text, max = MAX_WORDS) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += max) chunks.push(words.slice(i, i + max).join(' '));
  return chunks.length ? chunks : [''];
}

export function meanPool(vectors) {
  const d = vectors[0].length;
  const out = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) out[i] += v[i];
  for (let i = 0; i < d; i++) out[i] /= vectors.length;
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0)) || 1;
  return out.map((x) => x / norm);
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both L2-normalized → dot == cosine
}

async function embed(text) {
  const ex = await getExtractor();
  if (!ex) return null;
  const vecs = [];
  for (const c of chunkWords(text)) {
    const out = await ex(c, { pooling: 'mean', normalize: true });
    vecs.push(Array.from(out.data));
  }
  return meanPool(vecs);
}

// ── Lexical keyword overlap ──────────────────────────────────────────────────
const STOP = new Set(
  `a an the and or of to in for on with at by from as is are was were be been being this that these those it its they them their we our you your i me my he she his her will would can could should may might must do does did have has had not no nor so than then too very just also about above after again all am any because before below between both but down during each few more most other some such only own same once out up over under why how what when where which who whom whose into through against
  job role work team experience including ability strong excellent good great using use used within across per etc help support provide provides required preferred responsibilities qualifications years year company position opportunity candidate skills based plus etc. e.g i.e looking join including`
    .split(/\s+/),
);

export function terms(text) {
  return (String(text).toLowerCase().match(/[a-z][a-z0-9+#.\-]{2,}/g) || []).filter((w) => !STOP.has(w));
}

export function keywordOverlap(jdText, cvText) {
  const cvSet = new Set(terms(cvText));
  const jdKeywords = [...new Set(terms(jdText))];
  const matched = jdKeywords.filter((k) => cvSet.has(k));
  const missing = jdKeywords.filter((k) => !cvSet.has(k));
  const lexical = jdKeywords.length ? matched.length / jdKeywords.length : 0;
  return { lexical, matched, missing, total: jdKeywords.length };
}

/**
 * @returns {Promise<{score:number, semantic:number|null, lexical:number, matched:string[], missing:string[], mode:string}>}
 */
export async function matchScore(jdText, cvText) {
  const { lexical, matched, missing } = keywordOverlap(jdText, cvText);
  let semantic = null;
  const [jv, cvv] = await Promise.all([embed(jdText), embed(cvText)]);
  if (jv && cvv) semantic = Math.max(0, cosine(jv, cvv)); // clamp; relevant ~0.4–0.7
  const score = semantic == null
    ? Math.round(100 * lexical)
    : Math.round(100 * (W_SEM * semantic + W_LEX * lexical));
  return {
    score,
    semantic,
    lexical,
    matched,
    missing,
    mode: semantic == null ? 'lexical-only' : 'semantic+lexical',
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const cvIdx = args.indexOf('--cv');
  const cvPath = cvIdx !== -1 ? args[cvIdx + 1] : 'cv.md';
  const jdIdx = args.indexOf('--jd');

  let jdText = '';
  if (jdIdx !== -1) {
    jdText = args[jdIdx + 1] || '';
  } else {
    const pos = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--cv');
    if (pos && existsSync(pos)) jdText = readFileSync(pos, 'utf-8');
    else jdText = readStdin();
  }

  if (!existsSync(cvPath)) {
    console.error(`match-score: CV not found at ${cvPath} (use --cv <path>)`);
    process.exit(1);
  }
  if (!jdText.trim()) {
    console.error('match-score: no JD provided. Pass a file, --jd "text", or pipe via stdin.');
    process.exit(1);
  }

  const cvText = readFileSync(cvPath, 'utf-8');
  const r = await matchScore(jdText, cvText);

  if (asJson) {
    console.log(JSON.stringify(r));
    return;
  }
  const bar = '█'.repeat(Math.round(r.score / 5)).padEnd(20, '░');
  console.log(`\nMatch ${r.score}/100  [${bar}]   (${r.mode})`);
  if (r.semantic != null) console.log(`  semantic: ${(r.semantic * 100).toFixed(0)}%   lexical: ${(r.lexical * 100).toFixed(0)}% (${r.matched.length}/${r.matched.length + r.missing.length} JD terms in CV)`);
  else console.log(`  lexical: ${(r.lexical * 100).toFixed(0)}% (${r.matched.length}/${r.matched.length + r.missing.length} JD terms in CV)  — install @huggingface/transformers for semantic scoring`);
  console.log(`  ✓ matched: ${r.matched.slice(0, 18).join(', ') || '—'}`);
  console.log(`  ✗ missing: ${r.missing.slice(0, 18).join(', ') || '—'}`);
  console.log('\n  (relative triage signal — not a hiring verdict; the A–F eval is the judge)\n');
}

// Run as CLI only (not when imported)
import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
