import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import type { PrismaClient } from "@prisma/client";
import type { JsonValue } from "@prisma/client/runtime/library";

export interface AnnotationData {
  id: string;
  content: JsonValue; // JSON content from TipTap
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
  topicSpaceNodes: string[]; // TopicSpaceのグラフノードリスト（必須）
}

export class AnnotationFeatureExtractor {
  private db: PrismaClient;
  private artStopWords: Set<string>;

  constructor(db: PrismaClient) {
    this.db = db;

    // 芸術用語に特化したストップワード（一般的な語彙を除去）
    this.artStopWords = new Set([
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
      "もの",
      "こと",
      "とき",
      "ところ",
      "ため",
      "よう",
      "そう",
      "とても",
      "とても",
      "かなり",
      "すごく",
      "とても",
      "見る",
      "見える",
      "見た",
      "見て",
      "見る",
      "思う",
      "思った",
      "思って",
      "思う",
      "感じる",
      "感じた",
      "感じて",
      "感じる",
      "いい",
      "良い",
      "悪い",
      "すごい",
      "すばらしい",
      "とても",
      "かなり",
      "すごく",
      "とても",
    ]);
  }

  /**
   * 芸術的解釈に特化した特徴量を抽出
   */
  async extractFeatures(
    annotations: AnnotationData[],
    params: FeatureExtractionParams,
  ): Promise<{
    features: number[][];
    featureNames: string[];
    annotationIds: string[];
  }> {
    const {
      maxFeatures = 800, // テキスト特徴量を削減
      minDf = 2,
      maxDf = 0.95,
      includeMetadata = true,
      includeStructural = true,
      topicSpaceNodes, // 必須パラメータ
    } = params;

    // TopicSpaceノードが空の場合はエラー
    if (!topicSpaceNodes || topicSpaceNodes.length === 0) {
      throw new Error("topicSpaceNodesは必須で、空配列は許可されません");
    }

    // 1. テキスト特徴量の抽出（TopicSpace特化）
    const textFeatures = await this.extractArtFocusedTextFeatures(annotations, {
      maxFeatures,
      minDf,
      maxDf,
      topicSpaceNodes,
    });

    // 2. 解釈タイプ特徴量の抽出
    let interpretationFeatures: number[][] = [];
    if (includeMetadata) {
      interpretationFeatures = this.extractInterpretationFeatures(
        annotations,
        topicSpaceNodes,
      );
    }

    // 3. 議論の文脈特徴量の抽出
    let contextFeatures: number[][] = [];
    if (includeStructural) {
      contextFeatures = this.extractContextFeatures(annotations);
    }

    // 4. 特徴量を結合
    const allFeatures = textFeatures.map((textFeature, index) => {
      const interpretationFeature = interpretationFeatures[index] ?? [];
      const contextFeature = contextFeatures[index] ?? [];
      return [...textFeature, ...interpretationFeature, ...contextFeature];
    });

    // 5. 特徴量名を生成
    const textFeatureNames =
      textFeatures.length > 0
        ? textFeatures[0]!.map((_, i) => `art_term_${i}`)
        : [];
    const interpretationFeatureNames =
      interpretationFeatures.length > 0
        ? interpretationFeatures[0]!.map((_, i) => `interpretation_${i}`)
        : [];
    const contextFeatureNames =
      contextFeatures.length > 0
        ? contextFeatures[0]!.map((_, i) => `context_${i}`)
        : [];
    const featureNames = [
      ...textFeatureNames,
      ...interpretationFeatureNames,
      ...contextFeatureNames,
    ];

    return {
      features: allFeatures,
      featureNames,
      annotationIds: annotations.map((a) => a.id),
    };
  }

  /**
   * 芸術用語に特化したテキスト特徴量の抽出
   */
  private async extractArtFocusedTextFeatures(
    annotations: AnnotationData[],
    params: {
      maxFeatures: number;
      minDf: number;
      maxDf: number;
      topicSpaceNodes: string[];
    },
  ): Promise<number[][]> {
    const { maxFeatures, minDf, maxDf, topicSpaceNodes } = params;

    // 1. テキストの前処理（芸術用語に特化）
    const processedTexts = annotations.map((annotation) => {
      const text = convertJsonToText(annotation.content);
      return this.preprocessArtText(text);
    });

    // 2. TopicSpace特化の語彙を構築
    const vocabulary = this.buildArtVocabulary(
      processedTexts,
      minDf,
      maxDf,
      topicSpaceNodes,
    );
    const limitedVocabulary = vocabulary.slice(0, maxFeatures);

    // 3. TF-IDF計算
    const idfScores = this.calculateIdfScores(
      processedTexts,
      limitedVocabulary,
    );

    // 4. 特徴量ベクトルの生成
    const features: number[][] = processedTexts.map((text) => {
      const featureVector: number[] = Array.from(
        { length: limitedVocabulary.length },
        () => 0,
      );

      limitedVocabulary.forEach((term, index) => {
        const tf = this.calculateTf(text, term);
        const idf = idfScores.get(term) ?? 0;
        featureVector[index] = tf * idf;
      });

      return featureVector;
    });

    return features;
  }

  /**
   * 解釈タイプ特徴量の抽出（TopicSpace特化）
   */
  private extractInterpretationFeatures(
    annotations: AnnotationData[],
    topicSpaceNodes: string[],
  ): number[][] {
    const features: number[][] = [];

    // 解釈の深さ特徴量
    const depthFeatures = this.extractInterpretationDepthFeatures(
      annotations,
      topicSpaceNodes,
    );

    // 解釈の方向性特徴量
    const directionFeatures =
      this.extractInterpretationDirectionFeatures(annotations);

    // 注釈タイプ特徴量（芸術的解釈に特化）
    const typeFeatures = this.extractArtTypeFeatures(annotations);

    annotations.forEach((annotation, index) => {
      const featureVector = [
        ...(depthFeatures[index] ?? []),
        ...(directionFeatures[index] ?? []),
        ...(typeFeatures[index] ?? []),
      ];
      features.push(featureVector);
    });

    return features;
  }

  /**
   * 議論の文脈特徴量の抽出
   */
  private extractContextFeatures(annotations: AnnotationData[]): number[][] {
    const features: number[][] = [];

    // 議論の活発度特徴量
    const activityFeatures =
      this.extractDiscussionActivityFeatures(annotations);

    // 議論の継続性特徴量
    const continuityFeatures =
      this.extractDiscussionContinuityFeatures(annotations);

    // 議論の多様性特徴量
    const diversityFeatures =
      this.extractDiscussionDiversityFeatures(annotations);

    annotations.forEach((annotation, index) => {
      const featureVector = [
        ...(activityFeatures[index] ?? []),
        ...(continuityFeatures[index] ?? []),
        ...(diversityFeatures[index] ?? []),
      ];
      features.push(featureVector);
    });

    return features;
  }

  /**
   * 芸術用語に特化したテキストの前処理
   */
  private preprocessArtText(text: string): string {
    // 1. 小文字化
    let processed = text.toLowerCase();

    // 2. 特殊文字の除去（芸術用語を保持）
    processed = processed.replace(
      /[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\w\s]/g,
      " ",
    );

    // 3. 空白の正規化
    processed = processed.replace(/\s+/g, " ").trim();

    // 4. 芸術用語に特化したストップワードの除去
    const words = processed.split(" ");
    const filteredWords = words.filter(
      (word) => word.length > 1 && !this.artStopWords.has(word),
    );

    return filteredWords.join(" ");
  }

  /**
   * TopicSpace特化の語彙の構築
   */
  private buildArtVocabulary(
    texts: string[],
    minDf: number,
    maxDf: number,
    topicSpaceNodes: string[],
  ): string[] {
    const termCounts = new Map<string, number>();

    texts.forEach((text) => {
      const words = text.split(" ");
      const uniqueWords = new Set(words);

      uniqueWords.forEach((word) => {
        // TopicSpace特化の重み付け
        const weight = this.calculateContextualTermWeight(
          word,
          topicSpaceNodes,
        );
        termCounts.set(word, (termCounts.get(word) ?? 0) + weight);
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

    // TopicSpace特化の重要度でソート
    return vocabulary.sort((a, b) => {
      const weightA = this.calculateContextualTermWeight(a, topicSpaceNodes);
      const weightB = this.calculateContextualTermWeight(b, topicSpaceNodes);
      return weightB - weightA;
    });
  }

  /**
   * TopicSpace特化の用語重み付け計算
   */
  private calculateContextualTermWeight(
    term: string,
    topicSpaceNodes: string[],
  ): number {
    let weight = 1.0;

    // 長い単語（専門用語の可能性）に重み付け
    if (term.length >= 4) weight += 0.5;
    if (term.length >= 6) weight += 0.5;

    // TopicSpaceのノードに含まれる用語に高い重み付け
    if (topicSpaceNodes.includes(term)) {
      weight += 3.0; // TopicSpace特化の最高重み
    }

    return weight;
  }

  /**
   * TF（Term Frequency）の計算
   */
  private calculateTf(text: string, term: string): number {
    const words = text.toLowerCase().split(/\s+/);
    const termCount = words.filter(
      (word) => word === term.toLowerCase(),
    ).length;
    return words.length > 0 ? termCount / words.length : 0;
  }

  /**
   * IDF（Inverse Document Frequency）スコアの計算
   */
  private calculateIdfScores(
    texts: string[],
    vocabulary: string[],
  ): Map<string, number> {
    const idfScores = new Map<string, number>();
    const totalDocs = texts.length;

    vocabulary.forEach((term) => {
      // その用語を含む文書数を計算（単語境界を考慮）
      const docsWithTerm = texts.filter((text) => {
        const words = text.toLowerCase().split(/\s+/);
        return words.includes(term.toLowerCase());
      }).length;

      // IDF計算: log((totalDocs + 1) / (docsWithTerm + 1))
      // +1を加えることでゼロ除算を回避し、スムージング効果も得る
      const idf = Math.log((totalDocs + 1) / (docsWithTerm + 1));
      idfScores.set(term, idf);
    });

    return idfScores;
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

  /**
   * 解釈の深さ特徴量の抽出（TopicSpace特化）
   */
  private extractInterpretationDepthFeatures(
    annotations: AnnotationData[],
    topicSpaceNodes: string[],
  ): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const text = convertJsonToText(annotation.content);

      // テキストの長さ（解釈の詳細度）
      const textLength = text.length;
      const normalizedLength = Math.min(textLength, 1000) / 1000;

      // TopicSpace特化の専門用語密度
      const topicSpaceTermCount = topicSpaceNodes.filter((term) =>
        text.includes(term),
      ).length;
      const normalizedTopicSpaceDensity =
        topicSpaceTermCount / Math.max(topicSpaceNodes.length, 1);

      features.push([normalizedLength, normalizedTopicSpaceDensity]);
    });

    return features;
  }

  /**
   * 解釈の方向性特徴量の抽出
   */
  private extractInterpretationDirectionFeatures(
    annotations: AnnotationData[],
  ): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const text = convertJsonToText(annotation.content);

      // 肯定的/否定的な解釈
      const positiveWords = [
        "素晴らしい",
        "美しい",
        "感動的",
        "印象的",
        "優れた",
        "傑作",
        "名作",
      ];
      const negativeWords = ["問題", "批判", "疑問", "不適切", "悪い", "劣る"];

      const positiveCount = positiveWords.filter((word) =>
        text.includes(word),
      ).length;
      const negativeCount = negativeWords.filter((word) =>
        text.includes(word),
      ).length;

      const sentiment =
        (positiveCount - negativeCount) /
        Math.max(positiveCount + negativeCount, 1);

      // 客観的/主観的な解釈
      const objectiveWords = ["分析", "研究", "調査", "データ", "事実", "歴史"];
      const subjectiveWords = ["感じる", "思う", "印象", "個人的", "私見"];

      const objectiveCount = objectiveWords.filter((word) =>
        text.includes(word),
      ).length;
      const subjectiveCount = subjectiveWords.filter((word) =>
        text.includes(word),
      ).length;

      const objectivity =
        objectiveCount / Math.max(objectiveCount + subjectiveCount, 1);

      features.push([sentiment, objectivity]);
    });

    return features;
  }

  /**
   * 芸術的解釈に特化した注釈タイプ特徴量の抽出
   */
  private extractArtTypeFeatures(annotations: AnnotationData[]): number[][] {
    const artTypes = [
      "COMMENT", // 一般的なコメント
      "INTERPRETATION", // 解釈・分析
      "QUESTION", // 質問・疑問
      "CLARIFICATION", // 説明・補足
      "CRITICISM", // 批評・批判
      "SUPPORT", // 支持・賛同
    ];
    const typeMap = new Map(artTypes.map((type, index) => [type, index]));

    const features: number[][] = [];

    annotations.forEach((annotation) => {
      const typeIndex = typeMap.get(annotation.type) ?? 0;
      const typeVector: number[] = Array.from(
        { length: artTypes.length },
        () => 0,
      );
      typeVector[typeIndex] = 1;

      features.push(typeVector);
    });

    return features;
  }

  /**
   * 議論の活発度特徴量の抽出
   */
  private extractDiscussionActivityFeatures(
    annotations: AnnotationData[],
  ): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      // その注釈に対する返信数
      const replyCount = annotations.filter(
        (a) => a.parentAnnotationId === annotation.id,
      ).length;

      // その注釈の親注釈に対する返信数（兄弟注釈数）
      const siblingCount = annotation.parentAnnotationId
        ? annotations.filter(
            (a) => a.parentAnnotationId === annotation.parentAnnotationId,
          ).length - 1
        : 0;

      const normalizedReplyCount = Math.min(replyCount, 10) / 10;
      const normalizedSiblingCount = Math.min(siblingCount, 10) / 10;

      features.push([normalizedReplyCount, normalizedSiblingCount]);
    });

    return features;
  }

  /**
   * 議論の継続性特徴量の抽出
   */
  private extractDiscussionContinuityFeatures(
    annotations: AnnotationData[],
  ): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      // 階層の深さ（議論の継続性の指標）
      let depth = 0;
      let current = annotation;

      while (current.parentAnnotationId) {
        depth++;
        const parent = annotations.find(
          (a) => a.id === current.parentAnnotationId,
        );
        if (!parent) break;
        current = parent;
      }

      const normalizedDepth = Math.min(depth, 5) / 5;

      // 時間的な継続性（親注釈との時間差）
      let timeContinuity = 0;
      if (annotation.parentAnnotationId) {
        const parent = annotations.find(
          (a) => a.id === annotation.parentAnnotationId,
        );
        if (parent) {
          const timeDiff =
            annotation.createdAt.getTime() - parent.createdAt.getTime();
          const hoursDiff = timeDiff / (1000 * 60 * 60);
          timeContinuity = Math.min(hoursDiff, 168) / 168; // 1週間で正規化
        }
      }

      features.push([normalizedDepth, timeContinuity]);
    });

    return features;
  }

  /**
   * 議論の多様性特徴量の抽出
   */
  private extractDiscussionDiversityFeatures(
    annotations: AnnotationData[],
  ): number[][] {
    const features: number[][] = [];

    annotations.forEach((annotation) => {
      // その注釈の子注釈の作成者の多様性
      const childAnnotations = annotations.filter(
        (a) => a.parentAnnotationId === annotation.id,
      );

      const uniqueAuthors = new Set(childAnnotations.map((a) => a.authorId));
      const authorDiversity =
        uniqueAuthors.size / Math.max(childAnnotations.length, 1);

      // その注釈の子注釈のタイプの多様性
      const uniqueTypes = new Set(childAnnotations.map((a) => a.type));
      const typeDiversity =
        uniqueTypes.size / Math.max(childAnnotations.length, 1);

      features.push([authorDiversity, typeDiversity]);
    });

    return features;
  }
}
