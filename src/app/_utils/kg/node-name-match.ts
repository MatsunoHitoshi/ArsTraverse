/**
 * ノードの同一性・名前一致判定を、抽出言語の違い（例: name="ART PROJECT" と name="アートプロジェクト"）に
 * 影響されずに行うための共通ユーティリティ。
 *
 * トップレベルの `name` だけでなく `properties.name_ja` / `properties.name_en` も
 * 名前候補として扱うことで、表示名のローカライズと生 `name` の食い違いによる
 * 重複ノード生成・ハイライト漏れ・クリック時のノード未検出などを防ぐ。
 */

export type NodeNameLike = {
  name: string;
  properties?: unknown;
};

/** 同一性キー用の正規化: NFKC + trim + 小文字化（全角/半角・大文字小文字の揺れを吸収） */
export const normalizeNameKey = (value: string): string =>
  value.normalize("NFKC").trim().toLowerCase();

/**
 * ノードの名前候補（生の文字列）を返す。
 * ハイライトや検索など「実際の表記でマッチさせたい」用途で使う。
 * 重複は除去する。
 */
export const getNodeNameCandidates = (node: NodeNameLike): string[] => {
  const properties = (node.properties ?? {}) as Record<string, unknown>;
  const raw = [node.name, properties.name_ja, properties.name_en].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );
  return Array.from(new Set(raw.map((value) => value.trim())));
};

/**
 * ノードの同一性判定に使う正規化済みキー集合を返す。
 */
export const getNodeNameKeys = (node: NodeNameLike): Set<string> =>
  new Set(getNodeNameCandidates(node).map(normalizeNameKey));

/**
 * 2つのノードが name / name_ja / name_en のいずれかで一致すれば同一とみなす。
 */
export const nodesShareName = (a: NodeNameLike, b: NodeNameLike): boolean => {
  const keysA = getNodeNameKeys(a);
  for (const key of getNodeNameKeys(b)) {
    if (keysA.has(key)) return true;
  }
  return false;
};

/**
 * ノードが与えられた名前文字列（生 name / name_ja / name_en のいずれか）に一致するか。
 * クリック時のノード特定などに使う。
 */
export const nodeMatchesName = (node: NodeNameLike, name: string): boolean => {
  if (!name || name.trim() === "") return false;
  return getNodeNameKeys(node).has(normalizeNameKey(name));
};
