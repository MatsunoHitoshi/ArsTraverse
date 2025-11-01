/**
 * テキストからキーワードに関連する部分のみを抽出する関数
 * @param text 検索対象のテキスト
 * @param keywords 検索キーワードの配列
 * @param contextLength キーワードの前後から抽出する文字数（デフォルト: 200）
 * @returns 関連する部分の配列
 */
/**
 * CJK部首拡張とCJK統合漢字の包括的なマッピング
 * Unicode CJK部首拡張ブロック（U+2E80-U+2EFF）とCJK部首拡張A（U+2EA0-U+2EF3）
 * から統合漢字へのマッピング
 *
 * このマッピングは一般的な部首拡張文字をカバーしています。
 * 足りないものがあれば、Unicodeデータベースを参照して追加してください。
 */
/**
 * よく使われるCJK部首拡張文字のマッピング
 * 実際のテキストで使用されている文字と一般的な部首拡張文字を含む
 * このリストは、使用状況に応じて拡張できます
 */
const CJK_RADICAL_TO_UNIFIED: Record<string, string> = {
  // 実際のテキストで確認された文字（ログから）
  "\u2EA0": "\u6C11", // ⺠ -> 民 (CJK部首拡張A) - 実際のテキストで使用
  "\u2ED1": "\u9577", // ⻑ -> 長 (実際のテキストで使用)
  "\u2EE9": "\u9EC4", // ⻩ -> 黃 (実際のテキストで使用)
  "\u2EF2": "\u9F9C", // ⻲ -> 龜 (実際のテキストで使用)
  "\u2EC4": "\u897F", // ⻄ -> 西 (実際のテキストで使用)

  // 一般的によく使われる部首拡張文字
  "\u2E81": "\u5C0F", // ⺁ -> 小
  "\u2E8A": "\u4EBA", // ⺊ -> 人
  "\u2E8B": "\u5F92", // ⺋ -> 彳
  "\u2E8C": "\u5FC3", // ⺌ -> 心
  "\u2E8D": "\u5FC4", // ⺍ -> 戈
  "\u2E8E": "\u624B", // ⺎ -> 手
  "\u2E8F": "\u6C11", // ⺏ -> 民
  "\u2E90": "\u6C34", // ⺐ -> 水
  "\u2E91": "\u706B", // ⺑ -> 火
  "\u2E92": "\u7389", // ⺒ -> 玉
  "\u2E93": "\u7530", // ⺓ -> 田
  "\u2E94": "\u76EE", // ⺔ -> 目
  "\u2E95": "\u793A", // ⺕ -> 示
  "\u2E96": "\u79BE", // ⺖ -> 禾
  "\u2E97": "\u7C73", // ⺗ -> 米
  "\u2E98": "\u7CF8", // ⺘ -> 糸
  "\u2E99": "\u8033", // ⺙ -> 耳
  "\u2E9A": "\u8ECA", // ⺚ -> 車
  "\u2E9B": "\u9580", // ⺛ -> 門
  "\u2E9C": "\u9678", // ⺜ -> 阜
  "\u2E9D": "\u96CC", // ⺝ -> 隹
  "\u2E9E": "\u9801", // ⺞ -> 頁
  "\u2E9F": "\u98A8", // ⺟ -> 風

  // CJK部首拡張A（よく使われるもの）
  "\u2EA1": "\u4EBA", // ⺡ -> 人
  "\u2EA2": "\u624B", // ⺢ -> 手
  "\u2EA3": "\u6B63", // ⺣ -> 正
  "\u2EA4": "\u6C34", // ⺤ -> 水
  "\u2EA5": "\u706B", // ⺥ -> 火
  "\u2EA6": "\u7389", // ⺦ -> 玉
  "\u2EA7": "\u7530", // ⺧ -> 田
  "\u2EA8": "\u76EE", // ⺨ -> 目
  "\u2EA9": "\u793A", // ⺩ -> 示
  "\u2EAA": "\u79BE", // ⺪ -> 禾
  "\u2EAB": "\u7C73", // ⺫ -> 米
  "\u2EAC": "\u7CFB", // ⺬ -> 糸
  "\u2EAD": "\u8033", // ⺭ -> 耳
  "\u2EAE": "\u8ECA", // ⺮ -> 車
  "\u2EAF": "\u9580", // ⺯ -> 門
  "\u2EB0": "\u9678", // ⺰ -> 阜
  "\u2EB1": "\u96CC", // ⺱ -> 隹
  "\u2EB2": "\u9801", // ⺲ -> 頁
  "\u2EB3": "\u98A8", // ⺳ -> 風
  "\u2EB7": "\u9F8D", // ⺷ -> 龍
  "\u2EB8": "\u9F9C", // ⺸ -> 龜
  "\u2EB9": "\u9F9F", // ⺹ -> 龟
  "\u2ED0": "\u9577", // ⻐ -> 長

  // 新しいマッピングが必要な場合は、以下のコメント形式で追加してください
  // "\uXXXX": "\uYYYY", // ⺿ -> 漢字 (説明)
};

/**
 * マッピングテーブルを動的に生成する関数
 * Unicodeデータベースを参照して、不足しているマッピングを自動生成するためのヘルパー
 * 現時点では、上記のマッピングテーブルを直接使用します。
 */

/**
 * CJK部首拡張（U+2E80-U+2EFF）の範囲チェック
 * 部首拡張範囲内の文字を検出してマッピングを適用
 */
const isCJKRadical = (char: string): boolean => {
  const code = char.charCodeAt(0);
  // CJK部首拡張範囲: U+2E80-U+2EFF
  return code >= 0x2e80 && code <= 0x2eff;
};

/**
 * 文字列を正規化して比較用の文字列を生成
 * 各文字を個別に正規化することで、異体字のマッチングを改善
 */
const normalizeForSearch = (str: string): string => {
  return Array.from(str)
    .map((char) => {
      const charCode = char.charCodeAt(0);

      // まず、明示的なマッピングをチェック
      if (CJK_RADICAL_TO_UNIFIED[char]) {
        const mapped = CJK_RADICAL_TO_UNIFIED[char];
        console.log(
          `[normalizeForSearch] Explicit mapping "${char}" (U+${charCode.toString(16).toUpperCase()}) -> "${mapped}"`,
        );
        return mapped;
      }

      // CJK部首拡張範囲内の文字を検出
      if (isCJKRadical(char)) {
        console.log(
          `[normalizeForSearch] CJK Radical detected: "${char}" (U+${charCode.toString(16).toUpperCase()})`,
        );
        // NFKC正規化でCJK統合漢字に変換されるか試す
        const normalized = char.normalize("NFKC");
        if (normalized !== char) {
          console.log(
            `[normalizeForSearch] NFKC normalized "${char}" -> "${normalized}"`,
          );
          return normalized;
        }
        // NFKCで変換できない場合は、そのまま返す（ログに記録）
        console.log(
          `[normalizeForSearch] CJK Radical "${char}" could not be normalized, keeping as is`,
        );
      }

      // 各文字をNFKC正規化
      const normalized = char.normalize("NFKC");
      // さらに各文字を正規化（異体字セレクターなどを除去）
      return normalized
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .normalize("NFC");
    })
    .join("")
    .toLowerCase();
};

export const extractRelevantSections = (
  text: string,
  keywords: string[],
  contextLength = 200,
): string[] => {
  // テキスト内の「⺠」の文字コードを確認
  const minRadicalIndex = text.indexOf("⺠");
  if (minRadicalIndex >= 0 && minRadicalIndex < text.length) {
    const char = text[minRadicalIndex];
    if (char) {
      const charCode = char.charCodeAt(0);
      console.log(
        `[extractRelevantSections] Found "⺠" at index ${minRadicalIndex}, charCode: U+${charCode.toString(16).toUpperCase()}`,
      );
      console.log(
        `[extractRelevantSections] Mapping exists: ${!!CJK_RADICAL_TO_UNIFIED[char]}`,
      );
    }
  }

  // 検索用に正規化したテキスト（検索に使用）
  const normalizedText = normalizeForSearch(text);
  const relevantSections: string[] = [];

  keywords.forEach((keyword) => {
    // キーワードも同じ方法で正規化
    const normalizedKeyword = normalizeForSearch(keyword);

    console.log(
      `[extractRelevantSections] keyword: "${keyword}" -> normalized: "${normalizedKeyword}"`,
    );
    console.log(
      `[extractRelevantSections] text preview: "${text.slice(0, 30)}" -> normalized: "${normalizedText.slice(0, 30)}"`,
    );
    console.log(
      `[extractRelevantSections] contains check: ${normalizedText.includes(normalizedKeyword)}`,
    );

    if (!normalizedText.includes(normalizedKeyword)) {
      console.log(
        `[extractRelevantSections] Keyword "${keyword}" not found in text`,
      );
      return; // キーワードが見つからない場合はスキップ
    }

    let index = 0;

    while (index < normalizedText.length) {
      const foundIndex = normalizedText.indexOf(normalizedKeyword, index);
      if (foundIndex === -1) break;

      // 正規化後のインデックスを元のテキストのインデックスにマッピング
      // 正規化によって文字数が変わる可能性があるため、おおよその位置を計算
      // 通常は正規化後も文字数は同じかほぼ同じなので、同じインデックスを使用
      const start = Math.max(0, foundIndex - contextLength);
      const end = Math.min(
        text.length,
        foundIndex + normalizedKeyword.length + contextLength,
      );

      // 元のテキストからセクションを抽出
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
