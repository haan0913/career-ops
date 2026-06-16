// Apply kit — deterministic, no-API application guidance per role, grounded in
// Amir's profile (modes/_profile.md): which of the four résumé variants to use,
// the proof points to lead with, the title to mirror, and the next step. This
// is the visible bridge from "this role fits" (fit.ts) to "here's how to apply".
// It never drafts or submits anything — it tells the user what to emphasize.

import { classifyRole } from "./role";

export type ApplyKit = {
  variant: string; // which résumé variant
  variantWhy: string;
  emphasize: string[]; // proof points / themes to lead with
  titleMirror: string; // the title to mirror on the résumé/headline
  aiLeaning: boolean; // JD leans AI/automation → lead with the AI-Ambassador bullet
  nextStep: string;
};

// Compatible title set (profile: "title-match = 10.6x interview-rate lift").
const COMPATIBLE_TITLES = [
  "it project analyst", "pmo analyst", "project management analyst", "project analyst",
  "project coordinator", "it project coordinator", "technology project coordinator",
  "business analyst", "it analyst", "operations analyst", "implementation analyst",
  "implementation coordinator", "implementation specialist", "program coordinator",
  "associate project manager", "business systems analyst",
];

// Title-level AI lean (Amir's AI-enablement / automation archetypes).
const AI_TITLE_RE = /\b(ai|artificial intelligence|automation|enablement|machine learning|genai|llm)\b/i;
// JD must show a STRONG AI signal — bare "process automation" in a PMO JD
// shouldn't flip the variant.
const AI_STRONG_RE = /\bartificial intelligence\b|\bmachine learning\b|\bgenai\b|\bllm\b|large language model|\bai adoption\b|\bai enablement\b|ai-powered|ai\/ml/i;

// Role-family → résumé variant + emphasis (profile adaptive-framing table).
const FRAMING: Record<string, { variant: string; why: string; emphasize: string[] }> = {
  project: {
    variant: "Finance / PMO IC",
    why: "PMO / project / implementation role — your current-job lane",
    emphasize: [
      "Sole analyst on a 7-person GM IT PMO across a $25M+/yr portfolio",
      "Portfolio reporting, steering / go-no-go decks, RAID, PLC governance QA",
      "Implementation: go-live coordination, SOP authoring, stakeholder orchestration",
    ],
  },
  analyst: {
    variant: "BA-heavier",
    why: "business / operations analyst role — promote requirements + controls",
    emphasize: [
      "Requirements validation, current / future-state flows, traceability matrices",
      "Reconciliation-controls migration (SEC Rule 10b-10, Clearing & Settlement)",
      "Test-case design / UAT, vendor RFP",
    ],
  },
  operations: {
    variant: "Ops generalist",
    why: "operations / program-ops role — lead with cross-functional coordination",
    emphasize: [
      "Cross-functional coordination + automated-intake dashboards",
      "Milestone / dependency / risk tracking, stakeholder alignment",
      "Client-service & e-commerce ops history (Lily's: CRM + Shopify)",
    ],
  },
  product: {
    variant: "Finance / PMO IC",
    why: "product-ops / coordinator role — coordination + reporting",
    emphasize: [
      "Cross-functional coordination, intake / process ops, reporting",
      "Milestone & dependency tracking, dashboards",
      "Stakeholder alignment across a delivery org",
    ],
  },
};

const AI_FRAMING = {
  variant: "AI-heavier",
  why: "JD leans AI / automation / enablement — your rare differentiator",
  emphasize: [
    "Americas AI-Ambassador program — 125+ teams / 600+ staff enabled (your most distinctive bullet)",
    "Self-built AI automation hub + FileMind semantic search engine",
    "Legacy-model migration, change management, practical LLM tooling adoption",
  ],
};

function titleMirror(rawTitle: string): string {
  const t = (rawTitle || "").toLowerCase();
  const hit = COMPATIBLE_TITLES.find((c) => t.includes(c));
  if (hit) return rawTitle.trim(); // already a compatible title — mirror it verbatim
  // Otherwise suggest the closest compatible title by family.
  const role = classifyRole(rawTitle);
  if (role === "project") return "PMO Analyst / IT Project Analyst";
  if (role === "analyst") return "Business Analyst";
  if (role === "operations") return "Operations Analyst";
  return "Project / Business Analyst";
}

export function applyKit(job: { title: string }, jdHtml?: string | null): ApplyKit {
  const role = classifyRole(job.title);
  const jdText = String(jdHtml || "").replace(/<[^>]+>/g, " ");
  // Lead with the AI differentiator only on a genuine AI lean.
  const aiLeaning = AI_TITLE_RE.test(job.title) || AI_STRONG_RE.test(jdText);
  const framing = aiLeaning ? AI_FRAMING : (FRAMING[role] ?? FRAMING.project);
  return {
    variant: framing.variant,
    variantWhy: framing.why,
    emphasize: framing.emphasize,
    titleMirror: titleMirror(job.title),
    aiLeaning,
    nextStep: "Tailor the variant, mirror the title, then apply on the employer site. Never auto-submitted.",
  };
}
