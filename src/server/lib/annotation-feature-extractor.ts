import type { PrismaClient } from "@prisma/client";
import * as natural from "natural";

export interface AnnotationData {
  id: string;
  content: Record<string, unknown>; // JSON content from TipTap
  type: string;
  createdAt: Date;
  authorId: string;
  parentAnnotationId?: string | null;
  targetNodeId?: string | null;
  targetRelationshipId?: string | null;
}

export interface FeatureExtractionParams {
  maxFeatures?: number;
  minDf?: number;
  maxDf?: number;
  includeMetadata?: boolean;
  includeStructural?: boolean;
}

export class AnnotationFeatureExtractor {
  private db: PrismaClient;
  private stopWords: Set<string>;

  constructor(db: PrismaClient) {
    this.db = db;
    // 日本語のストップワード（簡易版）
    this.stopWords = new Set([
      "の",
      "に",
      "は",
      "を",
      "が",
      "で",
      "と",
      "も",
      "から",
      "まで",
      "です",
      "である",
      "だ",
      "である",
      "する",
      "した",
      "して",
      "される",
      "これ",
      "それ",
      "あれ",
      "この",
      "その",
      "あの",
      "ここ",
      "そこ",
      "あそこ",
      "私",
      "あなた",
      "彼",
      "彼女",
      "私たち",
      "あなたたち",
      "彼ら",
      "彼女ら",
    ]);
  }

  /**
   * 注釈ツリー全体の特徴量を抽出
   */
  async extractFeatures(
    annotations: AnnotationData[],
    params: FeatureExtractionParams = {},
  ): Promise<{
    features: number[][];
    featureNames: string[];
    annotationIds: string[];
  }> {
    const {
      maxFeatures = 1000,
      minDf = 2,
      maxDf = 0.95,
      includeMetadata = true,
      includeStructural = true,
    } = params;

    // 1. テキスト特徴量の抽出
    const textFeatures = await this.extractTextFeatures(annotations, {
      maxFeatures,
      minDf,
      maxDf,
    });

    // 2. メタデータ特徴量の抽出
    let metadataFeatures: number[][] = [];
    if (includeMetadata) {
      metadataFeatures = this.extractMetadataFeatures(annotations);
    }

    // 3. 構造特徴量の抽出
    let structuralFeatures: number[][] = [];
    if (includeStructural) {
      structuralFeatures = this.extractStructuralFeatures(annotations);
    }

    // 4. 特徴量を結合
    const allFeatures = textFeatures.map((textFeature, index) => {
      const metadataFeature = metadataFeatures[index] ?? [];
      const structuralFeature = structuralFeatures[index] ?? [];
      return [...textFeature, ...metadataFeature, ...structuralFeature];
    });

    // 5. 特徴量名を生成
    const textFeatureNames =
      textFeatures.length > 0
        ? textFeatures[0]!.map((_, i) => `text_${i}`)
        : [];
    const metadataFeatureNames =
      metadataFeatures.length > 0
        ? metadataFeatures[0]!.map((_, i) => `metadata_${i}`)
        : [];
    const structuralFeatureNames =
      structuralFeatures.length > 0
        ? structuralFeatures[0]!.map((_, i) => `structural_${i}`)
        : [];
    const featureNames = [
      ...textFeatureNames,
      ...metadataFeatureNames,
      ...structuralFeatureNames,
    ];

    return {
      features: allFeatures,
      featureNames,
      annotationIds: annotations.map((a) => a.id),
    };
  }

  /**
   * テキスト特徴量の抽出（TF-IDF）
   */
  private async extractTextFeatures(
    annotations: AnnotationData[],
    params: { maxFeatures: number; minDf: number; maxDf: number },
  ): Promise<number[][]> {
    const { maxFeatures, minDf, maxDf } = params;

    // 1. テキストの前処理
    const processedTexts = annotations.map((annotation) => {
      const text = this.extractTextFromContent(annotation.content);
      return this.preprocessText(text);
    });

    // 2. 語彙の構築
    const vocabulary = this.buildVocabulary(processedTexts, minDf, maxDf);
    const limitedVocabulary = vocabulary.slice(0, maxFeatures);

    // 3. TF-IDF計算
    const tfidf = new natural.TfIdf();

    // 各文書をTF-IDFに追加
    processedTexts.forEach((text) => {
      tfidf.addDocument(text);
    });

    // 4. 特徴量ベクトルの生成
    const features: number[][] = processedTexts.map((text) => {
      const featureVector: number[] = Array.from(
        { length: limitedVocabulary.length },
        () => 0,
      );

      limitedVocabulary.forEach((term, index) => {
        const tf = this.calculateTf(text, term);
        const idf = tfidf.idf(term);
        featureVector[index] = tf * idf;
      });

      return featureVector;
    });

    return features;
  }

  /**
   * メタデータ特徴量の抽出
   */
  private extractMetadataFeatures(annotations: AnnotationData[]): number[][] {
    const features: number[][] = [];

    // 時間特徴量
    const timeFeatures = this.extractTimeFeatures(annotations);

    // 作成者特徴量
    const authorFeatures = this.extractAuthorFeatures(annotations);

    // 注釈タイプ特徴量
    const typeFeatures = this.extractTypeFeatures(annotations);

    annotations.forEach((annotation, index) => {
      const featureVector = [
        ...(timeFeatures[index] ?? []),
        ...(authorFeatures[index] ?? []),
        ...(typeFeatures[index] ?? []),
      ];
      features.push(featureVector);
    });

    return features;
  }

  /**
   * 構造特徴量の抽出
   */
  private extractStructuralFeatures(annotations: AnnotationData[]): number[][] {
    const features: number[][] = [];

    // 階層レベル
    const levelFeatures = this.extractLevelFeatures(annotations);

    // 返信数
    const replyCountFeatures = this.extractReplyCountFeatures(annotations);

    // 親子関係の特徴
    const relationshipFeatures = this.extractRelationshipFeatures(annotations);

    annotations.forEach((annotation, index) => {
      const featureVector = [
        ...(levelFeatures[index] ?? []),
        ...(replyCountFeatures[index] ?? []),
        ...(relationshipFeatures[index] ?? []),
      ];
      features.push(featureVector);
    });

    return features;
  }

  /**
   * TipTapのJSONコンテンツからテキストを抽出
   */
  private extractTextFromContent(content: Record<string, unknown>): string {
    if (!content || typeof content !== "object") {
      return "";
    }

    let text = "";

    if (content.type === "doc" && content.content) {
      text = this.extractTextFromNodes(
        content.content as Record<string, unknown>[],
      );
    } else if (typeof content === "string") {
      text = content;
    }

    return text;
  }

  /**
   * TipTapノードからテキストを再帰的に抽出
   */
  private extractTextFromNodes(nodes: Record<string, unknown>[]): string {
    let text = "";

    nodes.forEach((node) => {
      if (node.type === "text" && node.text) {
        text += node.text as string;
      } else if (node.content) {
        text += this.extractTextFromNodes(
          node.content as Record<string, unknown>[],
        );
      }

      if (node.type === "paragraph" || node.type === "heading") {
        text += " ";
      }
    });

    return text;
  }

  /**
   * テキストの前処理
   */
  private preprocessText(text: string): string {
    // 1. 小文字化
    let processed = text.toLowerCase();

    // 2. 特殊文字の除去
    processed = processed.replace(
      /[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\w\s]/g,
      " ",
    );

    // 3. 空白の正規化
    processed = processed.replace(/\s+/g, " ").trim();

    // 4. ストップワードの除去
    const words = processed.split(" ");
    const filteredWords = words.filter(
      (word) => word.length > 1 && !this.stopWords.has(word),
    );

    return filteredWords.join(" ");
  }

  /**
   * 語彙の構築
   */
  private buildVocabulary(
    texts: string[],
    minDf: number,
    maxDf: number,
  ): string[] {
    const termCounts = new Map<string, number>();

    texts.forEach((text) => {
      const words = text.split(" ");
      const uniqueWords = new Set(words);

      uniqueWords.forEach((word) => {
        termCounts.set(word, (termCounts.get(word) ?? 0) + 1);
      });
    });

    const totalDocs = texts.length;
    const vocabulary: string[] = [];

    termCounts.forEach((count, term) => {
      const df = count / totalDocs;
      if (df >= minDf && df <= maxDf) {
        vocabulary.push(term);
      }
    });

    return vocabulary.sort();
  }

  /**
   * TF（Term Frequency）の計算
   */
  private calculateTf(text: string, term: string): number {
    const words = text.split(" ");
    const termCount = words.filter((word) => word === term).length;
    return termCount / words.length;
  }

  /**
   * 時間特徴量の抽出
   */
  private extractTimeFeatures(annotations: AnnotationData[]): number[][] {
    const now = new Date();
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const createdAt = new Date(annotation.createdAt);

      // 相対時間（時間単位）
      const hoursSinceCreation =
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      // 時間の周期性（時間、曜日、月）
      const hourOfDay = createdAt.getHours();
      const dayOfWeek = createdAt.getDay();
      const month = createdAt.getMonth();

      // 正規化
      const normalizedHours =
        Math.log(hoursSinceCreation + 1) / Math.log(24 * 30 + 1); // 30日で正規化
      const normalizedHour = hourOfDay / 24;
      const normalizedDay = dayOfWeek / 7;
      const normalizedMonth = month / 12;

      features.push([
        normalizedHours,
        normalizedHour,
        normalizedDay,
        normalizedMonth,
      ]);
    });

    return features;
  }

  /**
   * 作成者特徴量の抽出
   */
  private extractAuthorFeatures(annotations: AnnotationData[]): number[][] {
    const authorIds = [...new Set(annotations.map((a) => a.authorId))];
    const authorMap = new Map(authorIds.map((id, index) => [id, index]));

    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const authorIndex = authorMap.get(annotation.authorId) ?? 0;
      const authorVector: number[] = Array.from(
        { length: authorIds.length },
        () => 0,
      );
      authorVector[authorIndex] = 1;

      features.push(authorVector);
    });

    return features;
  }

  /**
   * 注釈タイプ特徴量の抽出
   */
  private extractTypeFeatures(annotations: AnnotationData[]): number[][] {
    const types = [
      "COMMENT",
      "INTERPRETATION",
      "QUESTION",
      "CLARIFICATION",
      "CRITICISM",
      "SUPPORT",
    ];
    const typeMap = new Map(types.map((type, index) => [type, index]));

    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const typeIndex = typeMap.get(annotation.type) ?? 0;
      const typeVector: number[] = Array.from(
        { length: types.length },
        () => 0,
      );
      typeVector[typeIndex] = 1;

      features.push(typeVector);
    });

    return features;
  }

  /**
   * 階層レベル特徴量の抽出
   */
  private extractLevelFeatures(annotations: AnnotationData[]): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      let level = 0;
      let current = annotation;

      // 親を辿ってレベルを計算
      while (current.parentAnnotationId) {
        level++;
        const parent = annotations.find(
          (a) => a.id === current.parentAnnotationId,
        );
        if (!parent) break;
        current = parent;
      }

      // 正規化（最大レベル10で想定）
      const normalizedLevel = Math.min(level, 10) / 10;

      features.push([normalizedLevel]);
    });

    return features;
  }

  /**
   * 返信数特徴量の抽出
   */
  private extractReplyCountFeatures(annotations: AnnotationData[]): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const replyCount = annotations.filter(
        (a) => a.parentAnnotationId === annotation.id,
      ).length;

      // 正規化（最大返信数20で想定）
      const normalizedReplyCount = Math.min(replyCount, 20) / 20;

      features.push([normalizedReplyCount]);
    });

    return features;
  }

  /**
   * 親子関係特徴量の抽出
   */
  private extractRelationshipFeatures(
    annotations: AnnotationData[],
  ): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const hasParent = annotation.parentAnnotationId ? 1 : 0;
      const hasChildren = annotations.some(
        (a) => a.parentAnnotationId === annotation.id,
      )
        ? 1
        : 0;

      features.push([hasParent, hasChildren]);
    });

    return features;
  }
}
