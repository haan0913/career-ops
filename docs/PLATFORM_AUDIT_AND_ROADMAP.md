# career-ops → Job-Market Operating System: Audit, Parity Matrix, Architecture, Roadmap

Status: Phase 0 deliverable (A–D). Baseline captured 2026-06-12.

---

## Baseline (measured 2026-06-12)

| Metric | Value |
|---|---|
| Test suite | 94 passed / 0 failed / 1 warning (Go toolchain corrupted on host — environment, not project) |
| Pipeline entries | 183 list items in `data/pipeline.md` |
| Applications tracked | 14 rows in `data/applications.md` |
| JD snapshots | 165 JSON files in `data/jd/` |
| Sources | 4 JSearch saved searches + 45 ATS company boards (7 ATS provider types: Greenhouse, Ashby, Lever, Workday CXS, SmartRecruiters, Workable, Recruitee) + JSON-LD extractor |
| Scan history | TSV with url/first_seen/portal/title/company/status/location/posted |
| Dashboard | Next.js 16 (`web/`), 7 pages: Overview, Pipeline, Discover, Applications, Board, Analytics, Settings; SQLite projection over md/TSV |
| Dedup | Exact URL match + `company::role` string match only |
| Liveness | `check-liveness.mjs` (68 lines) + JSON-LD/browser helpers; not scheduled, not surfaced per-job |
| Freshness | `posted` date captured per provider; `--max-age-days` filter at scan time; no posted-vs-discovered-vs-updated distinction downstream |

## A. Competitive parity matrix

Method note: built from product knowledge through Jan 2026, validated against the codebase, **not** re-verified by live competitor crawls this session. Treat platform-specific claims as "verify before copying."

Legend: ✅ have · 🟡 partial · ❌ missing · ⛔ deliberately skip

| Capability | LinkedIn | Indeed | ZipRecruiter | Glassdoor | career-ops today | Verdict |
|---|---|---|---|---|---|---|
| Keyword/title/company search | ✅ | ✅ | ✅ | ✅ | 🟡 (facet filters, no free-text search box over corpus) | **Build** — highest-leverage gap |
| Semantic / NL search | 🟡 | 🟡 | 🟡 | ❌ | ❌ | Build (phase 3) |
| Location filters w/ metro + remote-geo correctness | ✅ | ✅ | ✅ | ✅ | 🟡 substring allow/block list | **Build normalized location model** |
| Salary filter + estimates | ✅ | ✅ | ✅ | ✅ | ✅ (annualized bands; employer-provided only) | Improve confidence labeling |
| Experience-level filter | ✅ | ✅ | ✅ | ✅ | ✅ (deterministic classifier) | Have; extend with years extraction |
| Date-posted filter / fresh-first | ✅ | ✅ | ✅ | ✅ | ✅ (Posted facet + scan-time max-age) | Have |
| Full JD in-app | ✅ | ✅ | ✅ | ✅ | ✅ (snapshot store) | Have |
| Original-source identification | ❌ | 🟡 | ❌ | ❌ | 🟡 (apply-link specificity ranking) | **Opportunity to beat them** |
| Cross-source dedup w/ source history | internal | internal | internal | internal | ❌ (exact URL only) | **Build** |
| Liveness verification surfaced to user | ❌ | 🟡 | ❌ | ❌ | 🟡 (script exists, not in UI) | **Opportunity** |
| Saved searches + alerts | ✅ | ✅ | ✅ | ✅ | 🟡 (saved searches drive scans; no alerting) | Build alerts |
| Recommendation explanations | ❌ | ❌ | ❌ | ❌ | 🟡 (eval reports explain, not in UI) | **Opportunity** |
| Application tracker w/ stages | 🟡 | 🟡 | 🟡 | ❌ | ✅ (Kanban + tracker + statuses) | Have; deepen events/contacts |
| Company pages / hiring activity | ✅ | ✅ | 🟡 | ✅ | ❌ | Build (phase 4+) |
| Market/comp intelligence | ✅ | ✅ | 🟡 | ✅ | ❌ | Later |
| Easy-apply | ✅ | ✅ | ✅ | ❌ | ⛔ | Skip — prefer direct employer apply; never auto-submit |
| Recruiter marketplace / ads / promoted jobs | ✅ | ✅ | ✅ | ✅ | ⛔ | Skip — marketplace mechanics, anti-user |
| Profile-visible-to-recruiters | ✅ | ✅ | ✅ | ❌ | ⛔ | Skip for now (privacy) |

Where we can genuinely **outperform**: original-source preference, honest freshness/liveness, explainable fit/winnability, degree-flexibility detection, and zero ad-driven ranking distortion. No incumbent does these well because their incentives point the other way.

## B. Current-state audit

**Strong components to preserve**
- Provider layer: 7 ATS types + JSearch + JSON-LD extractor, 3-tier source doctrine, partial-failure tolerant scan.
- JD snapshot store (scan-time capture, in-process read) — already better than aggregators that link out.
- Engine-owns-mutations doctrine; SQLite as rebuildable projection; md/TSV human-readable source of truth.
- Test suite (94 checks), data contract, deterministic level/role/salary classifiers.
- Discover page: user-controlled sourcing writing portals.yml safely.

**Critical defects** — none open (2 test failures fixed this session: validator drift on score format/`Resume ready`; Go toolchain mis-attributed failure).

**High-impact weaknesses**
1. **Dedup is exact-match only.** Same role across LinkedIn/Indeed/employer site enters as separate rows. No canonical job entity, no source history, no merge.
2. **Location is substring allow/block.** Works via curated blocklist but fragile: a new "Remote — Anywhere (EMEA)" variant passes if not blocklisted. No city/state/country/metro normalization; NYC vs Remote-US vs Chicago not independently filterable as structured groups.
3. **No corpus search.** Facets exist; there is no free-text search over titles/companies/JD text. SQLite FTS5 is sitting right there.
4. **Freshness semantics conflated.** `posted` vs `first_seen` captured, but UI doesn't distinguish posted/updated/discovered/verified; no repost detection; no date-confidence.
5. **Liveness not operationalized.** Script exists; not run on cadence, status not shown on cards, dead jobs not auto-closed.
6. **No source registry.** Source health/contribution/duplicate-rate is invisible; only scan-summary lines.

**Missing foundational capabilities**: canonical job schema (current: a markdown line); company entity; coverage/benchmark measurement; outcome learning loop.

**Data-quality issues**: pipeline.md mixes formats (early hand-curated tiers vs scan-appended rows); applications.md numbering inconsistent (`10` vs `001`); statuses bilingual (English/Spanish heritage from upstream).

**UX problems**: no job-detail permalink (drawer only); no command-center "what's new since last visit"; no company view; no search box.

**Technical debt**: legacy Go `dashboard/` coexists with `web/` (confuses tests and contributors); jds/ vs data/jd/ duplication of purpose; upstream Spanish-language remnants.

## C. Target architecture (incremental, not a rewrite)

```
sources (registry: portals.yml → sources.yml w/ health)
  ├─ ATS providers (7 types, 45 boards)        — tier 1, authoritative dates
  ├─ JSearch saved searches                    — tier 2, aggregator
  ├─ JSON-LD structured pages                  — tier 1.5
  └─ agent-run discovery (formalized checklist)— tier 3
        ↓ scan.mjs (partial-failure tolerant)
normalize → canonical job record (schema v2: identity/location/comp/freshness/content)
        ↓
entity resolution: company canonicalization → req-ID/apply-URL/desc-hash/title+location merge
        ↓
stores: data/*.md + TSV (human SoT) · data/jd/*.json (content) · web SQLite (projection + FTS5)
        ↓
intelligence: level/role/salary classifiers · fit+winnability scores w/ explanations · freshness/liveness
        ↓
dashboard: command center · search · job detail · company pages · pipeline · health
```

Principles: md/TSV stays source of truth; SQLite projection gains FTS5 + jobs/sources/companies tables; every new field additive; merges explainable and reversible (keep all source URLs).

## D. Prioritized roadmap

| # | Item | Impact | Complexity | Risk | Measure |
|---|---|---|---|---|---|
| 1 | **Normalized location model** (city/state/country/remote-geo enum; replace substring pass with structured match; keep blocklist as backstop) | Kills the #1 false-positive class | M | Low — additive field, old filter as fallback | location false-positive rate → ~0 on test corpus |
| 2 | **Canonical job schema v2 + dedup/entity resolution** (desc-hash + normalized title+company+location; merge w/ source history) | Foundation for everything | M-L | Med — merge errors; mitigate: reversible, log merges | duplicate rate; incorrect-merge rate |
| 3 | **FTS5 corpus search + search page** (title/company/JD text, combined with existing facets) | Daily-use leap | M | Low | search latency; user adoption |
| 4 | **Source registry + health page** (per-source: last scan, jobs, unique contribution, dupes, errors) | Coverage becomes measurable | S-M | Low | unique contribution per source |
| 5 | **Liveness operationalized** (cadence check, status chip, auto-close dead, repost detect) | Trust | M | Low | dead-listing rate in actionable queue → 0 |
| 6 | **Freshness semantics** (posted/updated/discovered/verified shown distinctly; age buckets; date confidence) | Honesty + ranking | S | Low | unknown-date rate |
| 7 | **Command-center home** (new since last visit, apply-first queue, follow-ups due, source warnings) | Daily workflow | M | Low | time-to-first-action |
| 8 | **Explainable fit/winnability in UI** (per-job: matched proof points, concerns, degree-flexibility flag) | The differentiator | M-L | Med (LLM cost) | strong-match acceptance rate |
| 9 | Company pages + hiring activity | Intelligence | M | Low | — |
| 10 | Outcome learning (which lanes/sources convert) | Compounding | L | sparse-data risk — label tentative | response rate by lane |

Items 1–6 are Phase 1–2 foundations; 7–8 the visible product leap; 9–10 follow.

**Not doing without explicit approval**: schema migrations that drop md/TSV; any scraping that bypasses access controls; auto-apply; paid API additions; replacing the engine.

---
Documentation Signature
Updated by: Claude (Fable 5)
Timestamp: 2026-06-12T00:00:00-04:00 (see git for exact commit time)
Change summary: Phase 0 deliverable — baseline metrics, competitive parity matrix, current-state audit, target architecture, prioritized roadmap for the job-market-OS evolution.
