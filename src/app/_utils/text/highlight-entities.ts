import type { CustomNodeType } from "@/app/const/types";
import { getNodeNameCandidates } from "@/app/_utils/kg/node-name-match";

const NORMALIZE_FORM: "NFC" | "NFD" = "NFC";

/**
 * マッチング用にUnicode正規化する（表記ゆれで長い名前がマッチしない問題を防ぐ）
 */
const normalizeForMatch = (s: string): string =>
  s.normalize(NORMALIZE_FORM);

/**
 * エンティティ名をエスケープして正規表現で使用できるようにする
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * 2つの範囲 [start1,end1) と [start2,end2) が重なるか
 */
const isOverlappingRange = (
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean =>
  start1 < end2 && start2 < end1;

/**
 * テキスト内のエンティティ名をハイライト用のマッチ情報に変換
 */
export interface HighlightMatch {
  start: number;
  end: number;
  entityName: string;
  entityId: string;
  entityLabel?: string;
}

/**
 * テキスト内のエンティティ名を検索してマッチ情報を返す
 */
export const findEntityMatches = (
  text: string,
  entities: CustomNodeType[],
): HighlightMatch[] => {
  if (!text || entities.length === 0) return [];

  const normalizedText = normalizeForMatch(text);
  const matches: HighlightMatch[] = [];

  // エンティティごとに name / name_ja / name_en を候補として展開し、
  // 表記の言語違い（例: name が英語で本文が日本語）でもハイライトできるようにする。
  const candidates = entities.flatMap((entity) =>
    getNodeNameCandidates(entity).map((candidateName) => ({
      entity,
      candidateName,
    })),
  );

  // 長い名前から順に処理（部分一致を防ぐため）
  const sortedCandidates = candidates
    .filter((c) => c.candidateName.length > 0)
    .sort((a, b) => b.candidateName.length - a.candidateName.length);

  sortedCandidates.forEach(({ entity, candidateName }) => {
    const normalizedName = normalizeForMatch(candidateName);
    const regex = new RegExp(escapeRegExp(normalizedName), "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(normalizedText)) !== null) {
      const start = match.index;
      const end = start + normalizedName.length;

      const isOverlapping = matches.some((existingMatch) =>
        isOverlappingRange(start, end, existingMatch.start, existingMatch.end),
      );

      if (!isOverlapping) {
        matches.push({
          start,
          end,
          entityName: entity.name,
          entityId: entity.id,
          entityLabel: entity.label,
        });
      }
    }
  });

  // 開始位置でソート
  return matches.sort((a, b) => a.start - b.start);
};

/**
 * ハイライトマッチ情報からテキストを分割してハイライト用の要素を作成
 */
export interface HighlightSegment {
  text: string;
  isHighlight: boolean;
  entityName?: string;
  entityId?: string;
  entityLabel?: string;
}

export const createHighlightSegments = (
  text: string,
  matches: HighlightMatch[],
): HighlightSegment[] => {
  if (matches.length === 0) {
    return [{ text, isHighlight: false }];
  }

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  const len = text.length;
  matches.forEach((match) => {
    const start = Math.max(0, Math.min(match.start, len));
    const end = Math.max(start, Math.min(match.end, len));

    if (start > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, start),
        isHighlight: false,
      });
    }

    segments.push({
      text: text.slice(start, end),
      isHighlight: true,
      entityName: match.entityName,
      entityId: match.entityId,
      entityLabel: match.entityLabel,
    });

    lastIndex = end;
  });

  // 最後のマッチ以降のテキストを追加
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isHighlight: false,
    });
  }

  return segments;
};
