import { describe, it, expect } from "vitest";
import { applyKit } from "./applykit";

describe("applyKit", () => {
  it("recommends the PMO variant for a project/PMO role", () => {
    const k = applyKit({ title: "IT Project Management Analyst" });
    expect(k.variant).toBe("Finance / PMO IC");
    expect(k.emphasize.join(" ")).toMatch(/PMO/);
  });

  it("recommends BA-heavier for a business analyst role", () => {
    const k = applyKit({ title: "Business Analyst" });
    expect(k.variant).toBe("BA-heavier");
    expect(k.emphasize.join(" ")).toMatch(/requirements/i);
  });

  it("flips to AI-heavier when the title leans AI/automation", () => {
    const k = applyKit({ title: "AI Enablement Analyst" });
    expect(k.variant).toBe("AI-heavier");
    expect(k.aiLeaning).toBe(true);
    expect(k.emphasize.join(" ")).toMatch(/AI-Ambassador/);
  });

  it("does NOT flip to AI for a plain PMO JD that merely mentions automation", () => {
    const k = applyKit({ title: "Project Coordinator" }, "<p>Drive process automation and improvement across teams.</p>");
    expect(k.aiLeaning).toBe(false);
    expect(k.variant).toBe("Finance / PMO IC");
  });

  it("flips to AI when the JD has a strong AI signal", () => {
    const k = applyKit({ title: "Operations Analyst" }, "<p>Support our machine learning and AI adoption initiatives.</p>");
    expect(k.aiLeaning).toBe(true);
  });

  it("mirrors a compatible title verbatim, else suggests one", () => {
    expect(applyKit({ title: "PMO Analyst" }).titleMirror).toBe("PMO Analyst");
    expect(applyKit({ title: "Delivery Lead, Transformation" }).titleMirror).toMatch(/PMO|Project/);
  });
});
