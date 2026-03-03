import { describe, it, expect } from "vitest";
import { legacyContentToDoc, docToLegacyContent } from "./schema";
import type { DocumentContent } from "./schema";

describe("legacyContentToDoc", () => {
  const legacy = {
    title: "Data Classification Policy",
    subtitle: "Internal Use Only",
    purpose: "Define data handling requirements",
    tiers: "Tier 1: Public, Tier 2: Internal",
    enforce: "Quarterly audits required",
  };

  it("converts flat fields to a ProseMirror doc", () => {
    const doc = legacyContentToDoc(legacy);
    expect(doc.type).toBe("doc");
    expect(doc.content.length).toBe(9);
  });

  it("sets heading level 1 for the title", () => {
    const doc = legacyContentToDoc(legacy);
    const title = doc.content[0];
    expect(title.type).toBe("heading");
    expect(title.attrs?.level).toBe(1);
    expect(title.content?.[0]?.text).toBe("Data Classification Policy");
  });

  it("creates subtitle as a paragraph after the title", () => {
    const doc = legacyContentToDoc(legacy);
    const subtitle = doc.content[1];
    expect(subtitle.type).toBe("paragraph");
    expect(subtitle.content?.[0]?.text).toBe("Internal Use Only");
  });

  it("creates section headings for overview, purpose, tiers, enforcement", () => {
    const doc = legacyContentToDoc(legacy);
    const headingTexts = doc.content
      .filter((n) => n.type === "heading")
      .map((n) => n.content?.[0]?.text);
    expect(headingTexts).toContain("Overview");
    expect(headingTexts).toContain("Purpose");
    expect(headingTexts).toContain("Tier Definitions");
    expect(headingTexts).toContain("Enforcement");
  });

  it("assigns nodeId to every node with attrs", () => {
    const doc = legacyContentToDoc(legacy);
    for (const node of doc.content) {
      expect(node.attrs?.nodeId).toBeDefined();
      expect(typeof node.attrs?.nodeId).toBe("string");
      expect((node.attrs?.nodeId as string).length).toBeGreaterThan(0);
    }
  });

  it("uses provided nodeIds when given", () => {
    const nodeIds = {
      title: "fixed-title-id",
      subtitle: "fixed-subtitle-id",
      purpose: "fixed-purpose-id",
    };
    const doc = legacyContentToDoc(legacy, nodeIds);
    expect(doc.content[0].attrs?.nodeId).toBe("fixed-title-id");
    expect(doc.content[1].attrs?.nodeId).toBe("fixed-subtitle-id");
    // Purpose paragraph is at index 4
    expect(doc.content[4].attrs?.nodeId).toBe("fixed-purpose-id");
  });

  it("generates UUIDs for missing nodeId keys", () => {
    const nodeIds = { title: "fixed-title-id" };
    const doc = legacyContentToDoc(legacy, nodeIds);
    expect(doc.content[0].attrs?.nodeId).toBe("fixed-title-id");
    // subtitle should be a generated UUID
    const subtitleId = doc.content[1].attrs?.nodeId as string;
    expect(subtitleId).not.toBe("fixed-title-id");
    expect(subtitleId.length).toBeGreaterThan(0);
  });

  it("handles empty string fields gracefully", () => {
    const doc = legacyContentToDoc({
      title: "",
      subtitle: "",
      purpose: "",
      tiers: "",
      enforce: "",
    });
    expect(doc.type).toBe("doc");
    expect(doc.content.length).toBe(9);
  });
});

describe("docToLegacyContent", () => {
  it("extracts title from h1", () => {
    const doc = legacyContentToDoc({
      title: "My Title",
      subtitle: "Sub",
      purpose: "P",
      tiers: "T",
      enforce: "E",
    });
    const legacy = docToLegacyContent(doc);
    expect(legacy.title).toBe("My Title");
  });

  it("extracts subtitle from first paragraph after h1", () => {
    const doc = legacyContentToDoc({
      title: "T",
      subtitle: "My Subtitle",
      purpose: "P",
      tiers: "T",
      enforce: "E",
    });
    const legacy = docToLegacyContent(doc);
    expect(legacy.subtitle).toBe("My Subtitle");
  });

  it("matches section content by heading text", () => {
    const doc = legacyContentToDoc({
      title: "T",
      subtitle: "S",
      purpose: "Purpose content here",
      tiers: "Tier definitions here",
      enforce: "Enforcement rules here",
    });
    const legacy = docToLegacyContent(doc);
    expect(legacy.purpose).toBe("Purpose content here");
    expect(legacy.tiers).toBe("Tier definitions here");
    expect(legacy.enforce).toBe("Enforcement rules here");
  });

  it("returns empty strings for missing sections", () => {
    const doc: DocumentContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, nodeId: "t" },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    };
    const legacy = docToLegacyContent(doc);
    expect(legacy.title).toBe("Title");
    expect(legacy.subtitle).toBe("");
    expect(legacy.purpose).toBe("");
    expect(legacy.tiers).toBe("");
    expect(legacy.enforce).toBe("");
  });
});

describe("round-trip: legacy -> doc -> legacy", () => {
  it("preserves content through conversion cycle", () => {
    const original = {
      title: "Data Classification Policy",
      subtitle: "Internal Use Only",
      purpose: "Define data handling requirements",
      tiers: "Tier 1: Public, Tier 2: Internal",
      enforce: "Quarterly audits required",
    };
    const doc = legacyContentToDoc(original);
    const roundTripped = docToLegacyContent(doc);
    expect(roundTripped).toEqual(original);
  });
});
