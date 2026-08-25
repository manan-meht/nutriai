import fs from "fs";
import path from "path";
import { tistraHealthGraph, SITE_URL } from "@/lib/seo/structured-data";
import { HEALTH_FAQ } from "@/lib/seo/faq";

// Structured data fails silently: an invalid graph renders exactly like a
// valid one and simply stops being read, with nothing in any log. These
// assertions are the only feedback loop short of Google's own test tool.

type Node = Record<string, unknown>;
const nodes = (includeFaq = true) =>
  (tistraHealthGraph(SITE_URL, includeFaq) as { "@graph": Node[] })["@graph"];
const byType = (t: string, includeFaq = true) => nodes(includeFaq).find((n) => n["@type"] === t);

describe("Tistra Health JSON-LD graph", () => {
  it("is a single @context'd graph", () => {
    const g = tistraHealthGraph() as Node;
    expect(g["@context"]).toBe("https://schema.org");
    expect(Array.isArray(g["@graph"])).toBe(true);
  });

  it("survives JSON serialisation without cycles or undefined", () => {
    const json = JSON.stringify(tistraHealthGraph(SITE_URL, true));
    expect(json).not.toMatch(/undefined/);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("carries the four entity types plus the FAQ", () => {
    const types = nodes().map((n) => n["@type"]);
    expect(types).toEqual(
      expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication", "Service", "FAQPage"])
    );
  });

  it("every @id reference resolves to a node that exists in the graph", () => {
    const declared = new Set(nodes().map((n) => n["@id"]).filter(Boolean));
    const refs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        const o = v as Node;
        // A bare {"@id": x} with no @type is a reference, not a definition.
        if (o["@id"] && !o["@type"]) refs.push(o["@id"] as string);
        Object.values(o).forEach(walk);
      }
    };
    walk(nodes());
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(declared).toContain(ref);
  });

  describe("SoftwareApplication", () => {
    const app = () => byType("SoftwareApplication") as Node;

    it("uses Google's documented category values", () => {
      expect(app().applicationCategory).toBe("HealthApplication");
      expect(app().applicationSubCategory).toBe("DietaryTracking");
      expect(app().operatingSystem).toBe("WhatsApp / Web Browser");
    });

    it("names the WhatsApp photo mechanism as a feature", () => {
      expect(app().featureList).toContain("AI photo-based nutrition logging via WhatsApp message");
    });

    it("has a priced offer with a currency", () => {
      const offer = app().offers as Node;
      expect(offer["@type"]).toBe("Offer");
      expect(offer.priceCurrency).toBe("USD");
      // Google drops an Offer whose price isn't parseable as a number.
      expect(Number(offer.price)).toBeGreaterThan(0);
    });

    it("states the medical-device and emergency boundary", () => {
      const text = String(app().disambiguatingDescription);
      expect(text).toMatch(/not a medical device/i);
      expect(text).toMatch(/emergency/i);
    });
  });

  describe("audience", () => {
    // targetPopulation is a MedicalStudy/MedicalGuideline property and is
    // not valid on SoftwareApplication or Service; PeopleAudience carries
    // the same meaning on both. This pins the mapping so it isn't
    // "corrected" back to an invalid property later.
    it.each(["SoftwareApplication", "Service"])("%s uses PeopleAudience, not targetPopulation", (t) => {
      const node = byType(t) as Node;
      expect(node.targetPopulation).toBeUndefined();
      const audience = node.audience as Node;
      expect(audience["@type"]).toBe("PeopleAudience");
      expect(String(audience.audienceType)).toMatch(/caregiver/i);
      expect(String(audience.audienceType)).toMatch(/aging parents/i);
    });
  });

  describe("FAQPage", () => {
    it("is omitted unless the page actually renders the FAQ", () => {
      expect(byType("FAQPage", false)).toBeUndefined();
    });

    it("has one Question per rendered entry, in order", () => {
      const faq = byType("FAQPage") as Node;
      const questions = faq.mainEntity as Node[];
      expect(questions).toHaveLength(HEALTH_FAQ.length);
      expect(questions.map((q) => q.name)).toEqual(HEALTH_FAQ.map((e) => e.question));
    });

    it("answers contain the visible copy verbatim", () => {
      const questions = (byType("FAQPage") as Node).mainEntity as Node[];
      questions.forEach((q, i) => {
        const answer = q.acceptedAnswer as Node;
        expect(answer["@type"]).toBe("Answer");
        expect(answer.text).toContain(HEALTH_FAQ[i].tldr);
        expect(answer.text).toContain(HEALTH_FAQ[i].detail);
      });
    });

    it("scopes its @id to the page it is rendered on", () => {
      const other = (tistraHealthGraph(`${SITE_URL}/family`, true) as { "@graph": Node[] })["@graph"];
      const a = (byType("FAQPage") as Node)["@id"];
      const b = other.find((n) => n["@type"] === "FAQPage")!["@id"];
      expect(a).not.toBe(b);
    });
  });
});

describe("FAQ content is shaped for extraction", () => {
  it("includes the caregiver intent questions verbatim", () => {
    const questions = HEALTH_FAQ.map((e) => e.question);
    expect(questions).toContain(
      "How do I help track nutrition for my parents without using a complex app?"
    );
    expect(questions).toContain("What is the simplest way for seniors to log meals?");
    expect(questions).toContain("How does WhatsApp nutrition tracking work for family caregivers?");
  });

  it.each(HEALTH_FAQ.map((e) => [e.question, e] as const))("%s has a usable summary", (_q, entry) => {
    // Every heading is a real question.
    expect(entry.question.trim().endsWith("?")).toBe(true);
    // Short enough to be quoted whole, long enough to answer.
    expect(entry.tldr.length).toBeGreaterThan(60);
    expect(entry.tldr.length).toBeLessThan(320);
    // At most two sentences.
    expect((entry.tldr.match(/[.!?](\s|$)/g) ?? []).length).toBeLessThanOrEqual(2);
    // Must not open with a dangling pronoun — a quoted answer has no
    // antecedent to resolve, which is the main way an extracted snippet
    // becomes meaningless.
    expect(entry.tldr).not.toMatch(/^(It|They|This|That|These|Those)\b/);
  });

  it("names the product often enough to be attributable when quoted", () => {
    const named = HEALTH_FAQ.filter((e) => e.tldr.includes("Tistra Health")).length;
    expect(named).toBeGreaterThanOrEqual(HEALTH_FAQ.length / 2);
  });
});

describe("the FAQ section is machine-readable", () => {
  // Comments stripped before matching: the component explains *why* it
  // avoids Reveal and "use client", and that explanation must not itself
  // trip the check. Same approach as home-no-coach.test.ts.
  const src = fs
    .readFileSync(path.join(__dirname, "..", "components", "home", "HealthFaq.tsx"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("renders on the server", () => {
    expect(src).not.toMatch(/^"use client"/m);
  });

  it("does not wrap answers in the scroll-reveal animation", () => {
    // Reveal renders children at inline opacity:0 until an
    // IntersectionObserver fires, which hides them from a renderer that
    // snapshots the page without scrolling.
    expect(src).not.toMatch(/<Reveal/);
  });

  it("puts each question in its own heading", () => {
    expect(src).toMatch(/<h3[^>]*>\s*\{entry\.question\}/);
  });
});

describe("llms.txt", () => {
  const txt = fs.readFileSync(path.join(__dirname, "..", "..", "public", "llms.txt"), "utf-8");

  it("opens with an H1 and a blockquote summary, per the spec", () => {
    const lines = txt.split("\n");
    expect(lines[0]).toBe("# Tistra Health");
    expect(txt).toMatch(/\n> /);
  });

  it("states what the product is not", () => {
    expect(txt).toMatch(/## What Tistra Health is not/);
    expect(txt).toMatch(/Not a medical device/);
    expect(txt).toMatch(/Not an emergency or monitoring system/);
  });

  it("describes the WhatsApp ingestion mechanism and the audience", () => {
    expect(txt).toMatch(/## Ingestion mechanism/);
    expect(txt).toMatch(/## Who it is for/);
    expect(txt).toMatch(/adult child/i);
  });

  it("only links to absolute, canonical URLs", () => {
    const links = [...txt.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(5);
    for (const l of links) expect(l).toMatch(/^https:\/\//);
  });
});
