import { ChatOpenAI } from "@langchain/openai";
import { db } from "@/server/db";

type TranslationPair = {
  sourceText: string;
  sourceLang: "ja" | "en";
  targetLang: "ja" | "en";
};

export class LLMTranslator {
  private llm: ChatOpenAI;
  private initialized = false;

  constructor() {
    this.llm = new ChatOpenAI({
      temperature: 0.0,
      model: "gpt-4o-mini",
      maxTokens: 2000,
    });
  }

  /**
   * LLM Translatorを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      console.log("Initializing LLM Translator...");
      this.initialized = true;
      console.log("LLM Translator initialized successfully");
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Failed to initialize LLM Translator:", error.message);
      } else {
        console.error("Failed to initialize LLM Translator:", error);
      }
      this.initialized = false;
    }
  }

  /**
   * キャッシュから翻訳を取得
   */
  private async getCachedTranslation(
    sourceText: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string | null> {
    try {
      const cached = await db.translationCache.findUnique({
        where: {
          sourceText_sourceLang_targetLang: {
            sourceText,
            sourceLang,
            targetLang,
          },
        },
      });
      return cached?.translatedText ?? null;
    } catch (error) {
      console.error("Error fetching translation cache:", error);
      return null;
    }
  }

  /**
   * 翻訳結果をキャッシュに保存
   */
  private async saveTranslationCache(
    sourceText: string,
    sourceLang: string,
    targetLang: string,
    translatedText: string,
  ): Promise<void> {
    try {
      await db.translationCache.upsert({
        where: {
          sourceText_sourceLang_targetLang: {
            sourceText,
            sourceLang,
            targetLang,
          },
        },
        create: {
          sourceText,
          sourceLang,
          targetLang,
          translatedText,
        },
        update: {
          translatedText,
        },
      });
    } catch (error) {
      console.error("Error saving translation cache:", error);
      // エラーが発生しても処理は続行
    }
  }

  /**
   * バッチ翻訳を実行
   * 複数のテキストを一度に翻訳してコストを削減
   */
  async translateBatch(pairs: TranslationPair[]): Promise<Map<string, string>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = new Map<string, string>();
    const toTranslate: TranslationPair[] = [];

    // キャッシュから取得できるものは先に取得
    for (const pair of pairs) {
      const cacheKey = `${pair.sourceText}:${pair.sourceLang}:${pair.targetLang}`;
      const cached = await this.getCachedTranslation(
        pair.sourceText,
        pair.sourceLang,
        pair.targetLang,
      );
      if (cached) {
        results.set(cacheKey, cached);
      } else {
        toTranslate.push(pair);
      }
    }

    // キャッシュにないものだけ翻訳
    if (toTranslate.length === 0) {
      return results;
    }

    // バッチサイズを制限（API制限とコストを考慮）
    const BATCH_SIZE = 20;
    for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + BATCH_SIZE);
      const batchResults = await this.translateBatchWithLLM(batch);

      // 結果を保存
      for (const [key, translated] of batchResults.entries()) {
        results.set(key, translated);
        const pair = batch.find(
          (p) => `${p.sourceText}:${p.sourceLang}:${p.targetLang}` === key,
        );
        if (pair) {
          await this.saveTranslationCache(
            pair.sourceText,
            pair.sourceLang,
            pair.targetLang,
            translated,
          );
        }
      }
    }

    return results;
  }

  /**
   * LLMを使用してバッチ翻訳を実行
   */
  private async translateBatchWithLLM(
    pairs: TranslationPair[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    try {
      // プロンプトを作成
      const sourceLangName =
        pairs[0]?.sourceLang === "ja" ? "Japanese" : "English";
      const targetLangName =
        pairs[0]?.targetLang === "ja" ? "Japanese" : "English";

      const textsToTranslate = pairs.map((p) => p.sourceText);
      const prompt = `You are a professional translator specializing in proper nouns, especially for art-related terms, museums, artists, and cultural institutions.

Translate the following ${sourceLangName} terms to ${targetLangName}. 
- For proper nouns (names of people, places, organizations, museums, etc.), use the official or commonly accepted translation.
- For example: "森美術館" should be translated to "Mori Art Museum", not "The Forest Museum".
- If a term is already in the target language (e.g. English text input for Japanese-to-English translation), output it exactly as is.
- CRITICAL: Ensure the output is strictly in ${targetLangName}. Do NOT return ${sourceLangName} characters unless they are part of a proper noun that has no translation.
- Return ONLY a JSON array of translations in the same order as the input, with no additional text or explanation.

Input terms:
${textsToTranslate.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Return format: ["translation1", "translation2", ...]`;

      const response = await this.llm.invoke(prompt);
      const responseText = response.content as string;

      // JSON配列をパース
      let translations: string[];
      try {
        // レスポンスからJSON配列を抽出（マークダウンコードブロックがある場合に対応）
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          translations = JSON.parse(jsonMatch[0]) as string[];
        } else {
          translations = JSON.parse(responseText) as string[];
        }
      } catch (parseError) {
        console.error("Failed to parse LLM response:", responseText);
        // フォールバック: 各行を個別に翻訳
        const fallbackResults = await this.fallbackIndividualTranslation(pairs);
        // フォールバック結果を配列に変換
        translations = pairs.map((p) => {
          const cacheKey = `${p.sourceText}:${p.sourceLang}:${p.targetLang}`;
          return fallbackResults.get(cacheKey) ?? p.sourceText;
        });
      }

      // 結果をマップに格納
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (!pair) continue;
        const cacheKey = `${pair.sourceText}:${pair.sourceLang}:${pair.targetLang}`;
        const translated = translations[i] ?? pair.sourceText;
        results.set(cacheKey, translated);
      }
    } catch (error) {
      console.error("Batch translation error:", error);
      // エラー時はフォールバック
      const fallbackResults = await this.fallbackIndividualTranslation(pairs);
      for (const [key, value] of fallbackResults.entries()) {
        results.set(key, value);
      }
    }

    return results;
  }

  /**
   * フォールバック: 個別に翻訳
   */
  private async fallbackIndividualTranslation(
    pairs: TranslationPair[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const pair of pairs) {
      try {
        const sourceLangName =
          pair.sourceLang === "ja" ? "Japanese" : "English";
        const targetLangName =
          pair.targetLang === "ja" ? "Japanese" : "English";

        const prompt = `Translate the following ${sourceLangName} term to ${targetLangName}. 
For proper nouns (names of people, places, organizations, museums, etc.), use the official or commonly accepted translation.
If a term is already in the target language (e.g. English text input for Japanese-to-English translation), output it exactly as is.
CRITICAL: Ensure the output is strictly in ${targetLangName}. Do NOT return ${sourceLangName} characters unless they are part of a proper noun that has no translation.
Return ONLY the translation with no additional text.

Term: ${pair.sourceText}`;

        const response = await this.llm.invoke(prompt);
        const translated = (response.content as string).trim();
        const cacheKey = `${pair.sourceText}:${pair.sourceLang}:${pair.targetLang}`;
        results.set(cacheKey, translated);
      } catch (error) {
        console.error(`Failed to translate "${pair.sourceText}":`, error);
        const cacheKey = `${pair.sourceText}:${pair.sourceLang}:${pair.targetLang}`;
        results.set(cacheKey, pair.sourceText); // フォールバック: 元のテキストを返す
      }
    }

    return results;
  }

  /**
   * 日本語から英語への翻訳（既存インターフェースとの互換性のため）
   */
  async translateJaToEn(text: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    // キャッシュを確認
    const cached = await this.getCachedTranslation(text, "ja", "en");
    if (cached) {
      return cached;
    }

    // 翻訳を実行
    const results = await this.translateBatch([
      { sourceText: text, sourceLang: "ja", targetLang: "en" },
    ]);

    const cacheKey = `${text}:ja:en`;
    return results.get(cacheKey) ?? text;
  }

  /**
   * 英語から日本語への翻訳（既存インターフェースとの互換性のため）
   */
  async translateEnToJa(text: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    // キャッシュを確認
    const cached = await this.getCachedTranslation(text, "en", "ja");
    if (cached) {
      return cached;
    }

    // 翻訳を実行
    const results = await this.translateBatch([
      { sourceText: text, sourceLang: "en", targetLang: "ja" },
    ]);

    const cacheKey = `${text}:en:ja`;
    return results.get(cacheKey) ?? text;
  }

  /**
   * 翻訳モデルの状態を確認
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 翻訳モデルをクリーンアップ
   */
  async cleanup(): Promise<void> {
    try {
      this.initialized = false;
      console.log("LLM Translator cleaned up");
    } catch (error) {
      console.error("Error cleaning up LLM Translator:", error);
    }
  }
}
