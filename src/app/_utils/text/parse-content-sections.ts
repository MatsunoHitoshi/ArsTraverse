import type { JSONContent } from "@tiptap/core";
import { findEntityHighlights } from "./find-entity-highlights";

/** 1段落（Segment）の解析結果 */
export interface ParsedSegment {
  paragraphIndex: number;
  text: string;
  entityNames: string[];
  /** グラフノードID（API側で entityNames からマッチして付与） */
  nodeIds?: string[];
  /** エッジ複合キー（API側で付与） */
  edgeIds?: string[];
}

/** Heading2 で区切られた1セクション */
export interface SectionWithSegments {
  sectionIndex: number;
  /** Heading2 の本文（見出しテキスト） */
  title: string;
  segments: ParsedSegment[];
  /** このセクション内に出現する全エンティティ名（クラスタのノード割り当て用） */
  entityNames: string[];
}

interface Block {
  type: "heading" | "paragraph";
  level?: number;
  text: string;
  from: number;
  to: number;
}

function getTextFromNodeContent(
  content: JSONContent["content"],
): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (c.type === "text" && c.text) return c.text;
      if (c.content) return getTextFromNodeContent(c.content);
      return "";
    })
    .join("");
}

/**
 * findEntityHighlights と同じ順序でテキスト長のみカウントする。
 * これで entity の from/to とブロックの from/to が一致する。
 */
function countTextLength(nodes: JSONContent[]): number {
  let position = 0;
  const traverse = (list: JSONContent[]) => {
    for (const node of list) {
      if (node.type === "text") {
        position += node.text?.length ?? 0;
      } else if (node.content) {
        traverse(node.content);
      }
    }
  };
  traverse(nodes);
  return position;
}

/** TipTap doc を走査してブロック（heading/paragraph）と位置を収集。position は findEntityHighlights と同一の基準。 */
function collectBlocksWithPositions(
  content: JSONContent[],
): Block[] {
  const blocks: Block[] = [];
  let position = 0;

  const traverse = (nodes: JSONContent[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const text = getTextFromNodeContent(node.content).trim();
        const len = node.content ? countTextLength(node.content) : 0;
        blocks.push({
          type: "heading",
          level: (node.attrs?.level as number) ?? 1,
          text,
          from: position,
          to: position + len,
        });
        position += len;
      } else if (node.type === "paragraph") {
        const rawText = node.content
          ? getTextFromNodeContent(node.content)
          : "";
        const text = rawText.trim();
        const len = node.content ? countTextLength(node.content) : 0;
        blocks.push({
          type: "paragraph",
          text,
          from: position,
          to: position + len,
        });
        position += len;
      } else if (node.content) {
        traverse(node.content);
      }
    }
  };

  traverse(content);
  return blocks;
}

/** エンティティの from/to がブロック [blockFrom, blockTo] と重なるか */
function entityOverlapsBlock(
  entityFrom: number,
  entityTo: number,
  blockFrom: number,
  blockTo: number,
): boolean {
  return entityFrom < blockTo && entityTo > blockFrom;
}

/**
 * TipTap の doc.content を Section（Heading2 区切り）と Segment（Paragraph）に分解する。
 * - Section = Heading2 で区切られたブロック。各 Section が 1 つの Community に対応。
 * - Segment = 各 Paragraph。スクロールステップに対応。
 */
export function extractSectionsWithSegments(
  content: JSONContent[],
): SectionWithSegments[] {
  const blocks = collectBlocksWithPositions(content);
  const highlights = findEntityHighlights(content);

  console.log("[extractSectionsWithSegments] blocks", blocks.length, blocks.map((b) => ({ type: b.type, level: b.level, from: b.from, to: b.to, text: b.text.slice(0, 30) + (b.text.length > 30 ? "…" : "") })));
  console.log("[extractSectionsWithSegments] highlights", highlights.length, highlights.slice(0, 20).map((h) => ({ name: h.name, from: h.from, to: h.to })), highlights.length > 20 ? `... and ${highlights.length - 20} more` : "");

  const sections: SectionWithSegments[] = [];
  let currentSection: SectionWithSegments | null = null;
  let segmentIndex = 0;

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      currentSection = {
        sectionIndex: sections.length,
        title: block.text,
        segments: [],
        entityNames: [],
      };
      sections.push(currentSection);
      segmentIndex = 0;
      continue;
    }

    if (block.type === "paragraph") {
      const segmentEntityNames = highlights
        .filter((h) =>
          entityOverlapsBlock(h.from, h.to, block.from, block.to),
        )
        .map((h) => h.name);

      const segment: ParsedSegment = {
        paragraphIndex: segmentIndex,
        text: block.text,
        entityNames: [...new Set(segmentEntityNames)],
      };

      if (currentSection) {
        currentSection.segments.push(segment);
        const nameSet = new Set(currentSection.entityNames);
        segmentEntityNames.forEach((name) => nameSet.add(name));
        currentSection.entityNames = Array.from(nameSet);
      } else {
        currentSection = {
          sectionIndex: sections.length,
          title: "",
          segments: [segment],
          entityNames: [...new Set(segmentEntityNames)],
        };
        sections.push(currentSection);
      }
      segmentIndex += 1;
    }
  }

  console.log("[extractSectionsWithSegments] sections", sections.length, sections.map((s) => ({ index: s.sectionIndex, title: s.title, segments: s.segments.length, entityNames: s.entityNames.length, entityNamesSample: s.entityNames.slice(0, 8) })));
  return sections;
}
