import type { PrismaClient } from "@prisma/client";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import OpenAI from "openai";

export interface ClusterTitleGenerationParams {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  batchSize?: number; // 並列処理するバッチサイズ
  delayBetweenBatches?: number; // バッチ間の遅延（ミリ秒）
}

export interface ClusterTitleResult {
  clusterId: number;
  title: string;
  confidence?: number;
}

export class ClusterTitleGenerator {
  private db: PrismaClient;
  private openai: OpenAI;

  constructor(db: PrismaClient) {
    this.db = db;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * 複数のクラスターのタイトルを並列処理で生成
   */
  async generateClusterTitles(
    clusters: Array<{
      clusterId: number;
      annotationIds: string[];
    }>,
    params: ClusterTitleGenerationParams = {},
  ): Promise<ClusterTitleResult[]> {
    const {
      maxTokens = 50,
      temperature = 0.3,
      model = "gpt-4o-mini",
      batchSize = 5, // デフォルトで5つずつ並列処理
      delayBetweenBatches = 1000, // バッチ間で1秒待機
    } = params;

    const results: ClusterTitleResult[] = [];

    // クラスターをバッチに分割
    const batches = this.chunkArray(clusters, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch) continue;

      console.log(
        `バッチ ${i + 1}/${batches.length} を処理中 (${batch.length}個のクラスター)`,
      );

      // バッチ内のクラスターを並列処理
      const batchPromises = batch.map(async (cluster) => {
        try {
          const annotations = await this.db.annotation.findMany({
            where: {
              id: { in: cluster.annotationIds },
              isDeleted: false,
            },
            select: {
              id: true,
              content: true,
              type: true,
            },
          });

          if (annotations.length === 0) {
            return {
              clusterId: cluster.clusterId,
              title: `クラスター ${cluster.clusterId}`,
              confidence: 0,
            };
          }

          // 注釈のテキストを抽出・結合
          const annotationTexts = annotations
            .map((annotation) => {
              return convertJsonToText(annotation.content);
            })
            .filter((text) => text.trim().length > 0);

          if (annotationTexts.length === 0) {
            return {
              clusterId: cluster.clusterId,
              title: `クラスター ${cluster.clusterId}`,
              confidence: 0,
            };
          }

          // GPT APIを呼び出してタイトルを生成
          const title = await this.generateTitleWithGPT(
            annotationTexts,
            maxTokens,
            temperature,
            model,
          );

          return {
            clusterId: cluster.clusterId,
            title,
            confidence: 0.8,
          };
        } catch (error) {
          console.error(
            `クラスター ${cluster.clusterId} のタイトル生成エラー:`,
            error,
          );
          return {
            clusterId: cluster.clusterId,
            title: `クラスター ${cluster.clusterId}`,
            confidence: 0,
          };
        }
      });

      // バッチの並列処理を実行
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 最後のバッチでない場合は遅延
      if (i < batches.length - 1) {
        console.log(`${delayBetweenBatches}ms 待機中...`);
        await this.delay(delayBetweenBatches);
      }
    }

    return results;
  }

  /**
   * GPT APIを使用してタイトルを生成（リトライ機能付き）
   */
  private async generateTitleWithGPT(
    annotationTexts: string[],
    maxTokens: number,
    temperature: number,
    model: string,
    maxRetries: number = 3,
  ): Promise<string> {
    // より柔軟なテキスト選択アルゴリズム
    const maxTotalLength = 1000;
    const selectedTexts = this.selectBalancedTexts(
      annotationTexts,
      maxTotalLength,
    );

    // 各注釈を明確に区切って表示
    const formattedTexts = selectedTexts
      .map((text, index) => `【注釈${index + 1}】\n${text}`)
      .join("\n\n");

    const prompt = `以下の複数の注釈の内容を総合的に分析して、これらの注釈を代表する短いタイトル（10文字以内）を生成してください。日本語で回答してください。

${formattedTexts}

上記の注釈群を代表するタイトル:`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: maxTokens,
          temperature,
        });

        const title = response.choices[0]?.message?.content?.trim();

        if (!title) {
          throw new Error("No title generated");
        }

        // タイトルが長すぎる場合は切り詰め
        return title.length > 20 ? title.slice(0, 20) + "..." : title;
      } catch (error: any) {
        console.error(
          `GPT API呼び出しエラー (試行 ${attempt}/${maxRetries}):`,
          error,
        );

        // レート制限エラーの場合は待機時間を増やしてリトライ
        if (error.status === 429 && attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 指数バックオフ
          console.log(`${waitTime}ms 待機してリトライします...`);
          await this.delay(waitTime);
          continue;
        }

        // その他のエラーまたは最大リトライ回数に達した場合
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }

    throw new Error("Max retries exceeded");
  }

  /**
   * バランスの取れたテキスト選択アルゴリズム
   * 各注釈から均等にテキストを選択し、長いテキストが他のテキストを圧迫しないようにする
   */
  private selectBalancedTexts(texts: string[], maxLength: number): string[] {
    if (texts.length === 0) return [];
    if (texts.length === 1) {
      const firstText = texts[0];
      return firstText ? [firstText.slice(0, maxLength)] : [];
    }

    // 各テキストの長さを計算
    const textLengths = texts.map((text) => text.length);
    const totalLength = textLengths.reduce((sum, len) => sum + len, 0);

    // 全体が制限内の場合はそのまま返す
    if (totalLength <= maxLength) {
      return texts;
    }

    // 各テキストに割り当てる最大長を計算
    const maxPerText = Math.floor(maxLength / texts.length);
    const minPerText = Math.floor(maxPerText * 0.5); // 最低でも50%は確保

    const selectedTexts: string[] = [];
    let remainingLength = maxLength;

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) continue;

      const originalLength = text.length;

      // 残りのテキスト数に応じて動的に調整
      const remainingTexts = texts.length - i;
      const dynamicMaxLength = Math.max(
        minPerText,
        Math.floor(remainingLength / remainingTexts),
      );

      if (originalLength <= dynamicMaxLength) {
        // テキストが制限内の場合はそのまま使用
        selectedTexts.push(text);
        remainingLength -= originalLength;
      } else {
        // テキストが長すぎる場合は切り詰め
        selectedTexts.push(text.slice(0, dynamicMaxLength));
        remainingLength -= dynamicMaxLength;
      }
    }

    return selectedTexts;
  }

  /**
   * 配列を指定したサイズのチャンクに分割
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }
    return chunks;
  }

  /**
   * 指定した時間だけ待機
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * デフォルトパラメータを取得
   */
  getDefaultParams(): ClusterTitleGenerationParams {
    return {
      maxTokens: 50,
      temperature: 0.3,
      model: "gpt-3.5-turbo",
      batchSize: 5,
      delayBetweenBatches: 1000,
    };
  }
}
