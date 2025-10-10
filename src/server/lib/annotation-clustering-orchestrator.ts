import type { PrismaClient } from "@prisma/client";
import {
  AnnotationData,
  AnnotationFeatureExtractor,
  FeatureExtractionParams,
} from "./annotation-feature-extractor";
import {
  UMAPParameters,
  DimensionalityReductionResult,
  DimensionalityReductionService,
} from "./dimensionality-reduction-service";
import {
  ClusteringParameters,
  ClusteringResult,
  ClusteringService,
} from "./clustering-service";

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
    total: number;
  };
}

export class AnnotationClusteringOrchestrator {
  private db: PrismaClient;
  private featureExtractor: AnnotationFeatureExtractor;
  private dimensionalityReductionService: DimensionalityReductionService;
  private clusteringService: ClusteringService;

  constructor(db: PrismaClient) {
    this.db = db;
    this.featureExtractor = new AnnotationFeatureExtractor(db);
    this.dimensionalityReductionService = new DimensionalityReductionService();
    this.clusteringService = new ClusteringService();
  }

  /**
   * 注釈ツリー全体のクラスタリングを実行
   */
  async performClustering(
    rootAnnotationId: string,
    params: AnnotationClusteringParams,
  ): Promise<AnnotationClusteringResult> {
    const startTime = Date.now();

    try {
      // 1. 注釈データを取得
      const annotations = await this.getAnnotationTree(rootAnnotationId);

      if (annotations.length < 2) {
        throw new Error("クラスタリングには最低2つの注釈が必要です");
      }

      // 2. 特徴量抽出
      const featureStartTime = Date.now();
      const featureResult = await this.featureExtractor.extractFeatures(
        annotations,
        params.featureExtraction,
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
   * 注釈ツリー全体を取得
   */
  private async getAnnotationTree(
    rootAnnotationId: string,
  ): Promise<AnnotationData[]> {
    // ルート注釈を取得
    const rootAnnotation = await this.db.annotation.findUnique({
      where: { id: rootAnnotationId, isDeleted: false },
      include: {
        author: true,
        childAnnotations: {
          where: { isDeleted: false },
          include: {
            author: true,
            childAnnotations: {
              where: { isDeleted: false },
              include: {
                author: true,
              },
            },
          },
        },
      },
    });

    if (!rootAnnotation) {
      throw new Error("ルート注釈が見つかりません");
    }

    // 注釈ツリーを平坦化
    const annotations: AnnotationData[] = [];

    const flattenAnnotations = (
      annotation: Record<string, unknown>,
      level = 0,
    ) => {
      annotations.push({
        id: annotation.id as string,
        content: annotation.content as Record<string, unknown>,
        type: annotation.type as string,
        createdAt: annotation.createdAt as Date,
        authorId: annotation.authorId as string,
        parentAnnotationId: annotation.parentAnnotationId as string | null,
        targetNodeId: annotation.targetNodeId as string | null,
        targetRelationshipId: annotation.targetRelationshipId as string | null,
      });

      if (annotation.childAnnotations) {
        (annotation.childAnnotations as Record<string, unknown>[]).forEach(
          (child: Record<string, unknown>) => {
            flattenAnnotations(child, level + 1);
          },
        );
      }
    };

    flattenAnnotations(rootAnnotation);

    return annotations;
  }

  /**
   * デフォルトパラメータを取得
   */
  getDefaultParams(): AnnotationClusteringParams {
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
      clustering: {
        algorithm: "KMEANS",
        nClusters: 5,
      },
    };
  }

  /**
   * パラメータの妥当性を検証
   */
  validateParams(params: AnnotationClusteringParams): {
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

    // クラスタリングパラメータの検証
    if (
      params.clustering.algorithm === "KMEANS" &&
      params.clustering.nClusters &&
      params.clustering.nClusters < 2
    ) {
      errors.push("K-meansのnClustersは2以上である必要があります");
    }

    if (params.clustering.algorithm === "DBSCAN") {
      if (params.clustering.eps && params.clustering.eps <= 0) {
        errors.push("DBSCANのepsは0より大きい必要があります");
      }
      if (params.clustering.minSamples && params.clustering.minSamples < 2) {
        errors.push("DBSCANのminSamplesは2以上である必要があります");
      }
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
