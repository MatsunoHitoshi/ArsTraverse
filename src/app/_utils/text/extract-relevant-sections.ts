/**
 * テキストからキーワードに関連する部分のみを抽出する関数
 * @param text 検索対象のテキスト
 * @param keywords 検索キーワードの配列
 * @param contextLength キーワードの前後から抽出する文字数（デフォルト: 200）
 * @returns 関連する部分の配列
 */
export const extractRelevantSections = (
  text: string,
  keywords: string[],
  contextLength = 200,
): string[] => {
  const lowerText = text.toLowerCase();
  const relevantSections: string[] = [];

  keywords.forEach((keyword) => {
    const lowerKeyword = keyword.toLowerCase();
    let index = 0;

    while (index < lowerText.length) {
      const foundIndex = lowerText.indexOf(lowerKeyword, index);
      if (foundIndex === -1) break;

      // キーワードの前後からコンテキストを抽出
      const start = Math.max(0, foundIndex - contextLength);
      const end = Math.min(
        text.length,
        foundIndex + lowerKeyword.length + contextLength,
      );
      const section = text.substring(start, end);

      // 重複を避ける
      if (!relevantSections.some((s) => s.includes(section.substring(0, 50)))) {
        relevantSections.push(section);
      }

      index = foundIndex + 1;
    }
  });

  return relevantSections;
};
