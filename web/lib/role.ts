// Role-family classifier — pure, deterministic, client-safe. Groups a role by its
// function (what kind of work) independent of seniority. Order matters: specific
// domains are checked before the generic "analyst"/"operations" catch-alls so e.g.
// "Financial Analyst" → finance and "PMO Analyst" → project, not the generic bucket.

export type RoleFamily =
  | "analyst"
  | "project"
  | "operations"
  | "finance"
  | "data"
  | "product"
  | "compliance"
  | "sales"
  | "marketing"
  | "people"
  | "engineering"
  | "other";

export const ROLE_FAMILIES: RoleFamily[] = [
  "analyst",
  "project",
  "operations",
  "finance",
  "data",
  "product",
  "compliance",
  "sales",
  "marketing",
  "people",
  "engineering",
  "other",
];

const ROLE_LABELS: Record<RoleFamily, string> = {
  analyst: "Analyst",
  project: "Project / Program",
  operations: "Operations",
  finance: "Finance / Accounting",
  data: "Data / Analytics",
  product: "Product",
  compliance: "Risk / Compliance",
  sales: "Sales / BD",
  marketing: "Marketing",
  people: "People / HR",
  engineering: "Engineering",
  other: "Other",
};
export function roleLabel(r: RoleFamily): string {
  return ROLE_LABELS[r] || "Other";
}

export function classifyRole(title: string): RoleFamily {
  const t = " " + String(title || "").toLowerCase().replace(/[^a-z0-9+&/ ]+/g, " ").replace(/\s+/g, " ").trim() + " ";

  if (/\b(compliance|risk|aml|kyc|audit|auditor|regulatory|fraud|surveillance)\b/.test(t)) return "compliance";
  if (/\b(data|analytics|business intelligence|\bbi\b|sql|machine learning|\bml\b|data scientist)\b/.test(t)) return "data";
  if (/\b(finance|financial|fp&a|accounting|accountant|treasury|controller|investment|portfolio|tax|payroll|bookkeep)\b/.test(t))
    return "finance";
  if (/\b(project|program|pmo|scrum|delivery|implementation|deployment)\b/.test(t)) return "project";
  if (/\b(product manager|product owner|product management|\bproduct\b)\b/.test(t)) return "product";
  if (/\b(engineer|engineering|developer|software|devops|sre|infrastructure|qa|sdet)\b/.test(t)) return "engineering";
  if (/\b(sales|account executive|business development|\bbdr\b|\bsdr\b|account manager|partnerships)\b/.test(t)) return "sales";
  if (/\b(marketing|growth|seo|sem|content|brand|social media|communications|demand gen)\b/.test(t)) return "marketing";
  if (/\b(recruiter|recruiting|talent|\bhr\b|human resources|people ops|people operations)\b/.test(t)) return "people";
  // Generic catch-alls last
  if (/\b(analyst|analytics|research)\b/.test(t)) return "analyst";
  if (/\b(operations|\bops\b|coordinator|administrator|specialist|associate|assistant|support|office)\b/.test(t))
    return "operations";
  return "other";
}
