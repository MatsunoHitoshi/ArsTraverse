import type { PrismaClient } from "@prisma/client";
import {
  type AnnotationData,
  AnnotationFeatureExtractor,
  type FeatureExtractionParams,
} from "./annotation-feature-extractor";
import {
  type UMAPParameters,
  type DimensionalityReductionResult,
  DimensionalityReductionService,
} from "./dimensionality-reduction-service";
import {
  type ClusteringParameters,
  type ClusteringResult,
  ClusteringService,
} from "./clustering-service";
import { ClusterTitleGenerator } from "./cluster-title-generator";

export interface AnnotationClusteringParams {
  // 特徴量抽出パラメータ
  featureExtraction: FeatureExtractionParams;

  // 次元削減パラメータ
  dimensionalityReduction: UMAPParameters;

  // クラスタリングパラメータ
  clustering: ClusteringParameters;
}

export interface AnnotationClusteringResult {
  // 特徴量抽出結果
  features: {
    vectors: number[][];
    names: string[];
    annotationIds: string[];
  };

  // 次元削減結果
  dimensionalityReduction: DimensionalityReductionResult;

  // クラスタリング結果
  clustering: ClusteringResult;

  // 処理時間
  processingTime: {
    featureExtraction: number;
    dimensionalityReduction: number;
    clustering: number;
    titleGeneration: number;
    total: number;
  };
}

export class AnnotationClusteringOrchestrator {
  private db: PrismaClient;
  private featureExtractor: AnnotationFeatureExtractor;
  private dimensionalityReductionService: DimensionalityReductionService;
  private clusteringService: ClusteringService;
  private titleGenerator: ClusterTitleGenerator;

  constructor(db: PrismaClient) {
    this.db = db;
    this.featureExtractor = new AnnotationFeatureExtractor(db);
    this.dimensionalityReductionService = new DimensionalityReductionService();
    this.clusteringService = new ClusteringService();
    this.titleGenerator = new ClusterTitleGenerator(db);
  }

  /**
   * ノードまたはエッジに付随する注釈全体のクラスタリングを実行
   */
  async performClustering(
    targetNodeId: string | undefined,
    targetRelationshipId: string | undefined,
    topicSpaceNodes: string[],
    params: Omit<AnnotationClusteringParams, "featureExtraction"> & {
      featureExtraction: Omit<FeatureExtractionParams, "topicSpaceNodes">;
    },
  ): Promise<AnnotationClusteringResult> {
    const startTime = Date.now();

    try {
      // 1. 注釈データを取得
      const annotations = await this.getAnnotationsByTarget(
        targetNodeId,
        targetRelationshipId,
      );

      if (annotations.length < 2) {
        throw new Error("クラスタリングには最低2つの注釈が必要です");
      }

      // データ数が少ない場合は簡易的なクラスタリング結果を返す
      if (annotations.length < 3) {
        const coordinates = annotations.map((_, index) => ({
          x: Math.random() * 100,
          y: Math.random() * 100,
          annotationId: annotations[index]?.id ?? "",
        }));

        return {
          features: {
            vectors: [],
            names: [],
            annotationIds: annotations.map((a) => a.id),
          },
          dimensionalityReduction: {
            coordinates,
            annotationIds: annotations.map((a) => a.id),
            parameters: params.dimensionalityReduction,
          },
          clustering: {
            clusters: [
              {
                clusterId: 0,
                centerX: 50,
                centerY: 50,
                size: annotations.length,
                annotationIds: annotations.map((a) => a.id),
              },
            ],
            algorithm: "SIMPLE",
            parameters: params.clustering,
          },
          processingTime: {
            featureExtraction: 0,
            dimensionalityReduction: 0,
            clustering: 0,
            titleGeneration: 0,
            total: Date.now() - startTime,
          },
        };
      }

      // 2. 特徴量抽出
      const featureStartTime = Date.now();
      const featureResult = await this.featureExtractor.extractFeatures(
        annotations,
        {
          ...params.featureExtraction,
          topicSpaceNodes,
        },
      );
      const featureTime = Date.now() - featureStartTime;

      // 3. 特徴量の前処理
      const processedFeatures =
        this.dimensionalityReductionService.preprocessFeatures(
          featureResult.features,
        );

      // 4. 次元削減
      const reductionStartTime = Date.now();
      const reductionResult =
        await this.dimensionalityReductionService.performUMAP(
          processedFeatures,
          featureResult.annotationIds,
          params.dimensionalityReduction,
        );
      const reductionTime = Date.now() - reductionStartTime;

      // 5. クラスタリング
      const clusteringStartTime = Date.now();
      const clusteringResult = await this.performClusteringByAlgorithm(
        reductionResult.coordinates,
        params.clustering,
      );
      const clusteringTime = Date.now() - clusteringStartTime;

      // 6. クラスタータイトル生成
      const titleStartTime = Date.now();
      const clusterTitles = await this.titleGenerator.generateClusterTitles(
        clusteringResult.clusters.map((cluster) => ({
          clusterId: cluster.clusterId,
          annotationIds: cluster.annotationIds,
        })),
        this.titleGenerator.getDefaultParams(),
      );
      const titleTime = Date.now() - titleStartTime;

      // タイトルをクラスター結果に追加
      clusteringResult.clusters = clusteringResult.clusters.map((cluster) => {
        const titleResult = clusterTitles.find(
          (t) => t.clusterId === cluster.clusterId,
        );
        return {
          ...cluster,
          title: titleResult?.title ?? `クラスター ${cluster.clusterId}`,
        };
      });

      const totalTime = Date.now() - startTime;

      return {
        features: {
          vectors: featureResult.features,
          names: featureResult.featureNames,
          annotationIds: featureResult.annotationIds,
        },
        dimensionalityReduction: reductionResult,
        clustering: clusteringResult,
        processingTime: {
          featureExtraction: featureTime,
          dimensionalityReduction: reductionTime,
          clustering: clusteringTime,
          titleGeneration: titleTime,
          total: totalTime,
        },
      };
    } catch (error) {
      console.error("クラスタリング実行エラー:", error);
      throw new Error(`クラスタリングに失敗しました: ${String(error)}`);
    }
  }

  /**
   * アルゴリズムに応じてクラスタリングを実行
   */
  private async performClusteringByAlgorithm(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    params: ClusteringParameters,
  ): Promise<ClusteringResult> {
    switch (params.algorithm) {
      case "KMEANS":
        return await this.clusteringService.performKMeans(
          coordinates,
          params.nClusters ?? 5,
          100, // maxIterations
          params.useElbowMethod ?? false,
          params.elbowMethodRange,
        );

      case "DBSCAN":
        return await this.clusteringService.performDBSCAN(
          coordinates,
          params.eps ?? 0.5,
          params.minSamples ?? 5,
        );

      case "HIERARCHICAL":
        return await this.clusteringService.performHierarchicalClustering(
          coordinates,
          params.nClusters ?? 5,
          params.linkage ?? "ward",
        );

      default:
        throw new Error(
          `サポートされていないクラスタリングアルゴリズム: ${String(params.algorithm)}`,
        );
    }
  }

  /**
   * ノードまたはエッジに付随する注釈全体を取得
   */
  private async getAnnotationsByTarget(
    targetNodeId: string | undefined,
    targetRelationshipId: string | undefined,
  ): Promise<AnnotationData[]> {
    if (!targetNodeId && !targetRelationshipId) {
      throw new Error(
        "targetNodeIdまたはtargetRelationshipIdのいずれかが必要です",
      );
    }

    // まず、対象ノードまたはエッジに付随するすべての注釈IDを取得
    const rootAnnotations = await this.db.annotation.findMany({
      where: {
        isDeleted: false,
        OR: [
          targetNodeId ? { targetNodeId } : {},
          targetRelationshipId ? { targetRelationshipId } : {},
        ].filter((condition) => Object.keys(condition).length > 0),
      },
      select: { id: true },
    });

    // すべての注釈IDを収集（階層構造を含む）
    const allAnnotationIds = new Set<string>();

    const collectAllAnnotationIds = async (annotationIds: string[]) => {
      for (const annotationId of annotationIds) {
        if (allAnnotationIds.has(annotationId)) continue;
        allAnnotationIds.add(annotationId);

        // 子注釈のIDを取得
        const childAnnotations = await this.db.annotation.findMany({
          where: {
            parentAnnotationId: annotationId,
            isDeleted: false,
          },
          select: { id: true },
        });

        if (childAnnotations.length > 0) {
          const childIds = childAnnotations.map((child) => child.id);
          await collectAllAnnotationIds(childIds);
        }
      }
    };

    // ルート注釈から開始してすべての注釈IDを収集
    await collectAllAnnotationIds(rootAnnotations.map((a) => a.id));

    // 収集したIDで注釈の詳細を取得
    const annotations = await this.db.annotation.findMany({
      where: {
        id: { in: Array.from(allAnnotationIds) },
        isDeleted: false,
      },
      orderBy: { createdAt: "asc" },
    });

    // AnnotationData形式に変換
    const annotationData: AnnotationData[] = annotations.map((annotation) => ({
      id: annotation.id,
      content: annotation.content,
      type: annotation.type,
      createdAt: annotation.createdAt,
      authorId: annotation.authorId,
      parentAnnotationId: annotation.parentAnnotationId,
      targetNodeId: annotation.targetNodeId,
      targetRelationshipId: annotation.targetRelationshipId,
    }));

    return annotationData;
  }

  /**
   * デフォルトパラメータを取得（topicSpaceNodesを除く）
   */
  getDefaultParams(): Omit<AnnotationClusteringParams, "featureExtraction"> & {
    featureExtraction: Omit<FeatureExtractionParams, "topicSpaceNodes">;
  } {
    return {
      featureExtraction: {
        maxFeatures: 1000,
        minDf: 2,
        maxDf: 0.95,
        includeMetadata: true,
        includeStructural: true,
      },
      dimensionalityReduction: {
        nNeighbors: 15,
        minDist: 0.1,
        spread: 1.0,
        nComponents: 2,
        randomSeed: 42,
      },
      clustering: this.clusteringService.getDefaultParameters(
        this.clusteringService.getSystemDefaultAlgorithm(),
      ),
    };
  }

  /**
   * アルゴリズム別のデフォルトパラメータを取得
   */
  getDefaultParamsForAlgorithm(
    algorithm: "KMEANS" | "DBSCAN" | "HIERARCHICAL",
  ): Omit<AnnotationClusteringParams, "featureExtraction"> & {
    featureExtraction: Omit<FeatureExtractionParams, "topicSpaceNodes">;
  } {
    const baseParams = this.getDefaultParams();
    return {
      ...baseParams,
      clustering: this.clusteringService.getDefaultParameters(algorithm),
    };
  }

  /**
   * パラメータの妥当性を検証
   */
  validateParams(
    params: Omit<AnnotationClusteringParams, "featureExtraction"> & {
      featureExtraction: Omit<FeatureExtractionParams, "topicSpaceNodes">;
    },
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 特徴量抽出パラメータの検証
    if (
      params.featureExtraction.maxFeatures &&
      params.featureExtraction.maxFeatures < 10
    ) {
      errors.push("maxFeaturesは10以上である必要があります");
    }

    if (params.featureExtraction.minDf && params.featureExtraction.minDf < 1) {
      errors.push("minDfは1以上である必要があります");
    }

    if (
      params.featureExtraction.maxDf &&
      (params.featureExtraction.maxDf < 0 || params.featureExtraction.maxDf > 1)
    ) {
      errors.push("maxDfは0から1の間である必要があります");
    }

    // 次元削減パラメータの検証
    if (
      params.dimensionalityReduction.nNeighbors &&
      params.dimensionalityReduction.nNeighbors < 2
    ) {
      errors.push("nNeighborsは2以上である必要があります");
    }

    if (
      params.dimensionalityReduction.minDist &&
      (params.dimensionalityReduction.minDist < 0 ||
        params.dimensionalityReduction.minDist > 1)
    ) {
      errors.push("minDistは0から1の間である必要があります");
    }

    // クラスタリングパラメータの検証（ClusteringServiceの検証を使用）
    const clusteringValidation = this.clusteringService.validateParameters(
      params.clustering,
    );
    if (!clusteringValidation.valid) {
      errors.push(...clusteringValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * クラスタリング結果の統計情報を取得
   */
  getClusteringStatistics(result: AnnotationClusteringResult): {
    totalAnnotations: number;
    totalClusters: number;
    averageClusterSize: number;
    largestClusterSize: number;
    smallestClusterSize: number;
    qualityScore: number;
  } {
    const { clustering } = result;
    const totalAnnotations = result.features.annotationIds.length;
    const totalClusters = clustering.clusters.length;

    const clusterSizes = clustering.clusters.map((c) => c.size);
    const averageClusterSize =
      clusterSizes.reduce((sum, size) => sum + size, 0) / totalClusters;
    const largestClusterSize = Math.max(...clusterSizes);
    const smallestClusterSize = Math.min(...clusterSizes);

    // 品質スコア（シルエットスコアを基準）
    const qualityScore = clustering.qualityMetrics?.silhouetteScore ?? 0;

    return {
      totalAnnotations,
      totalClusters,
      averageClusterSize,
      largestClusterSize,
      smallestClusterSize,
      qualityScore,
    };
  }
}
