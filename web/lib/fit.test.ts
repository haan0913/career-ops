import { describe, it, expect } from "vitest";
import { computeFit } from "./fit";

const today = new Date().toISOString().slice(0, 10);
const longJd = (extra = "") =>
  "<p>" + ("We seek someone to drive PMO governance, requirements, UAT, and implementation onboarding across stakeholders. " + extra).repeat(6) + "</p>";

describe("computeFit", () => {
  it("rates a fresh, in-lane, paid, live NYC role highly", () => {
    const f = computeFit(
      { title: "Implementation Coordinator", location: "New York, NY", salary: "$85,000", level: "entry", posted: today, liveness: "live" },
      longJd(),
    );
    expect(f.score).toBeGreaterThanOrEqual(55);
    expect(["Apply immediately", "Strong application"]).toContain(f.overall);
    expect(f.evidence.length).toBeGreaterThan(0);
  });

  it("never labels a senior reach 'Apply immediately' (honors profile)", () => {
    const f = computeFit(
      { title: "Senior Program Manager", location: "New York, NY", salary: "$150,000", level: "senior", posted: today, liveness: "live" },
      longJd(),
    );
    expect(f.overall).not.toBe("Apply immediately");
    expect(f.concerns.join(" ")).toMatch(/reach/);
  });

  it("flags below-floor comp as a concern and dampens the label", () => {
    const f = computeFit(
      { title: "Operations Analyst", location: "New York, NY", salary: "$55,000", level: "entry", posted: today, liveness: "live" },
      longJd(),
    );
    expect(f.concerns.join(" ")).toMatch(/\$70k floor/);
    expect(["Apply immediately", "Strong application"]).not.toContain(f.overall);
  });

  it("detects degree flexibility vs strict requirement", () => {
    const flexible = computeFit({ title: "Business Analyst", location: "Remote, US", posted: today }, longJd("Bachelor's or equivalent experience accepted."));
    expect(flexible.degree).toBe("flexible");
    const strict = computeFit({ title: "Business Analyst", location: "Remote, US", posted: today }, longJd("A bachelor's degree is required."));
    expect(strict.degree).toBe("strict");
    expect(strict.concerns.join(" ")).toMatch(/bachelor/);
  });

  it("flags an out-of-lane role and a dead listing", () => {
    const f = computeFit(
      { title: "Senior Software Engineer", location: "Austin, TX", level: "senior", posted: today, liveness: "dead" },
      longJd(),
    );
    expect(f.concerns.join(" ")).toMatch(/closed/);
    expect(f.components.find((c) => c.key === "role")?.tone).toBe("warn");
  });

  it("applies the lane-signal nudge only when provided (keyed by classified lane)", () => {
    // "Operations Coordinator" classifies as the `operations` lane.
    const base = computeFit({ title: "Operations Coordinator", location: "New York, NY", level: "mid", posted: today }, longJd());
    const boosted = computeFit({ title: "Operations Coordinator", location: "New York, NY", level: "mid", posted: today }, longJd(), { operations: 0.5 });
    expect(boosted.score).toBeGreaterThan(base.score);
    expect(boosted.components.some((c) => c.key === "track")).toBe(true);
  });
});
