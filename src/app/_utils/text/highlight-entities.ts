import type { CustomNodeType } from "@/app/const/types";

/**
 * エンティティ名をエスケープして正規表現で使用できるようにする
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

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

  const matches: HighlightMatch[] = [];

  // 長いエンティティ名から順に処理（部分一致を防ぐため）
  const sortedEntities = [...entities].sort(
    (a, b) => b.name.length - a.name.length,
  );

  sortedEntities.forEach((entity) => {
    const regex = new RegExp(escapeRegExp(entity.name), "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // 既存のマッチと重複していないかチェック
      const isOverlapping = matches.some(
        (existingMatch) =>
          ((match?.index ?? 0) >= existingMatch.start &&
            (match?.index ?? 0) < existingMatch.end) ||
          ((match?.index ?? 0) + entity.name.length > existingMatch.start &&
            (match?.index ?? 0) + entity.name.length <= existingMatch.end),
      );

      if (!isOverlapping) {
        matches.push({
          start: match?.index ?? 0,
          end: (match?.index ?? 0) + entity.name.length,
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

  matches.forEach((match) => {
    // マッチ前のテキストを追加
    if (match.start > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.start),
        isHighlight: false,
      });
    }

    // ハイライト部分を追加
    segments.push({
      text: text.slice(match.start, match.end),
      isHighlight: true,
      entityName: match.entityName,
      entityId: match.entityId,
      entityLabel: match.entityLabel,
    });

    lastIndex = match.end;
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
