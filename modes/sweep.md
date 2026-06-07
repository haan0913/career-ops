# Mode: sweep — Broad-Market Discovery (agent-run, freshness-gated)

The zero-token `scan.mjs` only covers `tracked_companies` on Greenhouse/Ashby/Lever. **sweep** is the agent-run complement that covers the *broad market* the scanner can't reach — LinkedIn / Indeed / Glassdoor, Workday-hosted banks, and any employer without a scannable ATS — using WebSearch, then gating every hit through a **mandatory age + liveness check** before it touches `data/pipeline.md`.

> This formalizes the old "Nivel 3" WebSearch flow. It is the intended, supported path — **not** ad-hoc freelancing. Run it for broad-market volume beyond the tracked ATS boards (LinkedIn/Indeed/Glassdoor) and for employers without a Tier-1 provider yet.
>
> **Source tier (see `DATA_CONTRACT.md`): sweep is Tier 2/3.** Its leads are **never** trusted raw — each is canonicalized to the employer apply URL and passed through the mandatory **age + liveness gate** (using `liveness-jsonld.mjs` `datePosted`/`validThrough`) before it can enter `pipeline.md`.

## When to use
- After `node scan.mjs`, when you want more breadth than the tracked boards return.
- To scan employers without a Tier-1 provider in `scan.mjs` (custom sites or ATSs not yet supported): e.g. **Two Sigma** (custom), **DTCC** (Oracle CE REST), **BNY** (custom/Oracle). *(Nasdaq + Morningstar are now Tier-1 Workday CXS providers — no longer sweep-only.)*
- To run the `search_queries` block in `portals.yml` (LinkedIn/Indeed/Workday-bank/no-degree templates) that `scan.mjs` does not read.

## Run as a subagent
Run in the background so it doesn't consume main context:
```
Agent(subagent_type="general-purpose", prompt="[this file + any extra target companies]", run_in_background=True)
```

## Sources
1. **`portals.yml` → `search_queries`** (every entry with `enabled: true`) — LinkedIn/Indeed/Glassdoor/Workday-bank/no-degree `site:` templates.
2. **The 5 Workday/custom `tracked_companies`** (`scan_method: websearch`): use each entry's `scan_query`.
3. **Amir's lanes** (see `modes/_profile.md`): Implementation/Onboarding · IT Project/PMO Analyst · Business/Ops Analyst · AI Enablement · Program/Product Ops. Level Associate→Manager. NYC / remote-US / Chicago only.

## Workflow

1. **Load context:** `portals.yml` (queries, `title_filter`, `location_filter`), `data/scan-history.tsv`, `data/pipeline.md`, `data/applications.md` (the three dedup sources).
2. **Run WebSearch** for each enabled query (and each Workday employer's `scan_query`). Collect raw results.
3. **Extract** `{title, url, company}` from each result. Title/company patterns: `"Title @ Company"`, `"Title | Company"`, `"Title at Company"`, `"Title — Company"`. Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`.
4. **Filter** with `portals.yml`:
   - **Title:** ≥1 `positive` keyword AND 0 `negative` keywords (case-insensitive substring).
   - **Location:** apply `location_filter` (NYC / Remote-US / Chicago; block offshore + onsite non-target). Empty location → pass.
5. **Dedup** against all three sources by exact URL, and by `company::role` against `applications.md`.
6. **⚠️ MANDATORY FRESHNESS GATE (age + liveness) — before anything enters pipeline.md.**  
   WebSearch indexes surface **stale and dead** postings (proven: a 17-lead sweep had only 2 still live+fresh; the rest were 404/filled or 23–862 days stale). Live ATS-API hits from `scan.mjs` are current by construction and skip this gate; **every sweep hit must pass it.**

   For each candidate URL (sequential — **never run Playwright in parallel**):
   1. **Liveness:** `node check-liveness.mjs <url>` (or `browser_navigate` + `browser_snapshot`). Drop if `expired` (404/410, "no longer available/accepting", "position filled", `?error=true` redirect, listing-page, or <300 chars of content).
   2. **Age:** extract the posting date and **drop anything older than the cutoff (default 30 days)** or past its `application_deadline`. Date sources, by reliability:
      - **ATS board APIs** (most reliable): greenhouse `first_published`, ashby `publishedAt`, lever `createdAt`, SmartRecruiters `releasedDate`, Workable widget API.
      - **Page JobPosting JSON-LD** — `datePosted` + `validThrough` via the shared `liveness-jsonld.mjs` extractor (also surfaced by `check-liveness.mjs`). The Tier-2 freshness backbone for any page without a clean ATS API.
      - ⚠️ **Lever's per-posting API is unreliable for dates** — use the board API or the page JSON-LD instead.
      - If no date can be found, treat as **uncertain**: keep only if liveness is clearly `active`, and tag `posted n/a` so it sorts last and gets re-checked.
   3. Record the outcome in `scan-history.tsv` regardless (so it dedup-skips next time): `added`, `skipped_expired`, or `skipped_stale`.
7. **Write survivors only**, newest-first:
   - `data/pipeline.md` → Pending: `- [ ] {url} | {company} | {title} | posted {YYYY-MM-DD}`
   - `data/scan-history.tsv` → `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded\t{location}\t{posted}`
8. **Private/login-gated postings** (e.g. LinkedIn requiring auth): save the JD to `jds/{company}-{role-slug}.md` and add `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title} | posted {date}`.

## Output summary
```
Sweep — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries run:           N
Raw results:           N
Passed title+location: N
Duplicates:            N skipped
Expired (liveness):    N dropped
Stale (>{cutoff}d):    N dropped
New (live + fresh):    N added   ← only these reach pipeline.md

  + [{posted}] {company} | {title} | {location}
  ...

→ Run /career-ops pipeline to evaluate. Freshest first.
```

## Rules
- **Never add a lead that failed the freshness gate.** Live + within-cutoff or it doesn't enter pipeline.md.
- **Newest-first** everywhere — sort survivors by posting date descending.
- Respect `modes/_profile.md` targeting: NYC/remote-US/Chicago, Associate→Manager, degree-agnostic preferred, $70K floor. Don't surface offshore, onsite-non-target, or expert/5+yr-gated roles as priorities.
- One focused pass — timebox; breadth over exhaustiveness.
- See `modes/scan.md` (zero-token ATS path) and `modes/_shared.md` (Block G legitimacy) for the complementary flows.
