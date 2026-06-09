// Salary parsing — turn a displayed salary string into a comparable ANNUAL minimum
// so the pipeline can filter by pay. Handles the formats the providers emit:
//   "$90K–$120K/yr", "USD 5100-5900/month", "USD 125000-145000/year", "$120,000/yr"

export function parseSalaryAnnualMin(s?: string | null): number | null {
  if (!s) return null;
  const str = String(s);
  const m = str.match(/(\d[\d,]*\.?\d*)\s*([kK])?/); // first numeric token (the low end)
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (m[2]) n *= 1000; // "90K"
  const low = str.toLowerCase();
  if (/month|\/mo\b|monthly/.test(low)) n *= 12;
  else if (/hour|\/hr\b|hourly|per hour/.test(low)) n *= 2080;
  else if (/week|\/wk\b|weekly/.test(low)) n *= 52;
  else if (/\bday|daily/.test(low)) n *= 260;
  return Math.round(n);
}

export const SALARY_BANDS: { label: string; min: number }[] = [
  { label: "Any salary", min: 0 },
  { label: "$50k+", min: 50_000 },
  { label: "$75k+", min: 75_000 },
  { label: "$100k+", min: 100_000 },
  { label: "$130k+", min: 130_000 },
  { label: "$160k+", min: 160_000 },
];
