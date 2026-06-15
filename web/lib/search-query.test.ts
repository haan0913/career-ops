import { describe, it, expect } from "vitest";
import { toFtsQuery, hasExpansion } from "./search-query";

describe("toFtsQuery", () => {
  it("makes bare words prefix terms and AND-s them", () => {
    expect(toFtsQuery("project analyst")).toBe('"project"* AND "analyst"*');
  });

  it("preserves quoted phrases without expansion", () => {
    expect(toFtsQuery('"degree or equivalent"')).toBe('"degree or equivalent"');
  });

  it("expands known acronyms into an OR group", () => {
    const q = toFtsQuery("pm");
    expect(q).toContain('"pm"*');
    expect(q).toContain('"project manager"');
    expect(q.startsWith("(")).toBe(true);
  });

  it("expands synonyms and AND-s with other terms", () => {
    const q = toFtsQuery("ops nyc");
    expect(q).toContain('"operations"');
    expect(q).toContain('"new york"');
    expect(q).toContain(" AND ");
  });

  it("drops 1-char noise and neutralizes operators", () => {
    expect(toFtsQuery("a project")).toBe('"project"*');
    expect(toFtsQuery("c++ developer")).toContain('"c++"*');
  });

  it("hasExpansion flags expandable tokens only", () => {
    expect(hasExpansion("pm in nyc")).toBe(true);
    expect(hasExpansion("business analyst")).toBe(false);
  });
});
