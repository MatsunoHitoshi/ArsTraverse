import { env } from "@/env";
import { InferenceClient } from "@huggingface/inference";
import type { TranslationOutput } from "@huggingface/tasks";

export class HuggingFaceTranslator {
  private hf: InferenceClient;
  private initialized = false;

  constructor() {
    // コンストラクタで初期化
    const apiKey = env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error("HUGGINGFACE_API_KEY is required");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.hf = new InferenceClient(apiKey);
  }

  /**
   * Hugging Face Inference APIを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      console.log("Initializing Hugging Face Inference API...");
      this.initialized = true;
      console.log("Hugging Face Inference API initialized successfully");
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(
          "Failed to initialize Hugging Face Inference API:",
          error.message,
        );
      } else {
        console.error(
          "Failed to initialize Hugging Face Inference API:",
          error,
        );
      }
      this.initialized = false;
    }
  }

  /**
   * 日本語から英語への翻訳
   */
  async translateJaToEn(text: string): Promise<string> {
    if (!this.initialized) {
      console.warn(
        "Hugging Face translator not initialized, returning original text",
      );
      return text;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion
      const result = (await this.hf.translation({
        model: "Helsinki-NLP/opus-mt-ja-en",
        inputs: text,
      })) as TranslationOutput;
      return result.translation_text ?? text;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Japanese to English translation error:", error.message);
      } else {
        console.error("Japanese to English translation error:", error);
      }
      return text;
    }
  }

  /**
   * 英語から日本語への翻訳
   */
  async translateEnToJa(text: string): Promise<string> {
    if (!this.initialized) {
      console.warn(
        "Hugging Face translator not initialized, returning original text",
      );
      return text;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion
      const result = (await this.hf.translation({
        model: "Helsinki-NLP/opus-mt-en-ja",
        inputs: text,
      })) as TranslationOutput;
      return result.translation_text ?? text;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("English to Japanese translation error:", error.message);
      } else {
        console.error("English to Japanese translation error:", error);
      }
      return text;
    }
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
      console.log("Hugging Face translator cleaned up");
    } catch (error) {
      console.error("Error cleaning up Hugging Face translator:", error);
    }
  }
}
