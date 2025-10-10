import { UMAP } from "umap-js";

export interface UMAPParameters {
  nNeighbors?: number;
  minDist?: number;
  spread?: number;
  nComponents?: number;
  randomSeed?: number;
}

export interface DimensionalityReductionResult {
  coordinates: Array<{ x: number; y: number; annotationId: string }>;
  annotationIds: string[];
  parameters: UMAPParameters;
  qualityMetrics?: {
    trustworthiness?: number;
    continuity?: number;
  };
}

export class DimensionalityReductionService {
  /**
   * UMAPを使用して次元削減を実行
   */
  async performUMAP(
    features: number[][],
    annotationIds: string[],
    parameters: UMAPParameters = {},
  ): Promise<DimensionalityReductionResult> {
    const {
      nNeighbors = 15,
      minDist = 0.1,
      spread = 1.0,
      nComponents = 2,
      randomSeed = 42,
    } = parameters;

    try {
      // UMAPインスタンスを作成
      const umap = new UMAP({
        nNeighbors,
        minDist,
        spread,
        nComponents,
      });

      // UMAPを実行
      const embedding = umap.fit(features);

      // 結果を2次元座標に変換
      const coordinates = embedding.map((point, index) => ({
        x: point[0] ?? 0,
        y: point[1] ?? 0,
        annotationId: annotationIds[index] ?? "",
      }));

      // 品質指標を計算（簡易版）
      const qualityMetrics = this.calculateQualityMetrics(features, embedding);

      return {
        coordinates,
        annotationIds,
        parameters: {
          nNeighbors,
          minDist,
          spread,
          nComponents,
          randomSeed,
        },
        qualityMetrics,
      };
    } catch (error) {
      console.error("UMAP実行エラー:", error);
      throw new Error(`UMAP実行に失敗しました: ${String(error)}`);
    }
  }

  /**
   * 品質指標の計算（簡易版）
   */
  private calculateQualityMetrics(
    originalFeatures: number[][],
    embedding: number[][],
  ): { trustworthiness: number; continuity: number } {
    // 簡易的な信頼性指標の計算
    // 実際の実装では、より詳細な指標を計算することを推奨

    const n = originalFeatures.length;
    if (n < 2) {
      return { trustworthiness: 0, continuity: 0 };
    }

    // 元の特徴量空間での距離行列
    const originalDistances = this.calculateDistanceMatrix(originalFeatures);

    // 埋め込み空間での距離行列
    const embeddingDistances = this.calculateDistanceMatrix(embedding);

    // 信頼性指標の計算（簡易版）
    let trustworthiness = 0;
    let continuity = 0;
    let count = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const origDist = originalDistances[i]?.[j] ?? 0;
        const embedDist = embeddingDistances[i]?.[j] ?? 0;

        // 距離の比率を計算
        const ratio = embedDist / (origDist + 1e-8);

        if (ratio < 1.5) {
          trustworthiness += 1;
        }
        if (ratio > 0.5) {
          continuity += 1;
        }
        count++;
      }
    }

    return {
      trustworthiness: count > 0 ? trustworthiness / count : 0,
      continuity: count > 0 ? continuity / count : 0,
    };
  }

  /**
   * 距離行列の計算
   */
  private calculateDistanceMatrix(data: number[][]): number[][] {
    const n = data.length;
    const distances: number[][] = [];

    for (let i = 0; i < n; i++) {
      distances[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distances[i]![j] = 0;
        } else {
          distances[i]![j] = this.euclideanDistance(data[i]!, data[j]!);
        }
      }
    }

    return distances;
  }

  /**
   * ユークリッド距離の計算
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] ?? 0 - (b[i] ?? 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * 特徴量の正規化
   */
  normalizeFeatures(features: number[][]): number[][] {
    if (features.length === 0) return features;

    const n = features.length;
    const m = features[0]?.length ?? 0;
    const normalized: number[][] = [];

    // 各特徴量の平均と標準偏差を計算
    const means = new Array(m).fill(0);
    const stds = new Array(m).fill(0);

    // 平均を計算
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += features[i]?.[j] ?? 0;
      }
      means[j] = sum / n;
    }

    // 標準偏差を計算
    for (let j = 0; j < m; j++) {
      let sumSquaredDiff = 0;
      for (let i = 0; i < n; i++) {
        const diff = features[i]?.[j] ?? 0 - means[j];
        sumSquaredDiff += diff * diff;
      }
      stds[j] = Math.sqrt(sumSquaredDiff / n);
    }

    // 正規化を実行
    for (let i = 0; i < n; i++) {
      normalized[i] = [];
      for (let j = 0; j < m; j++) {
        if (stds[j] === 0) {
          normalized[i]![j] = 0;
        } else {
          normalized[i]![j] = (features[i]?.[j] ?? 0 - means[j]) / stds[j];
        }
      }
    }

    return normalized;
  }

  /**
   * 特徴量の次元削減前処理
   */
  preprocessFeatures(features: number[][]): number[][] {
    // 1. 正規化
    const normalized = this.normalizeFeatures(features);

    // 2. 欠損値の処理
    const processed = normalized.map((row) =>
      row.map((value) => (isNaN(value) ? 0 : value)),
    );

    // 3. 無限大値の処理
    const final = processed.map((row) =>
      row.map((value) => (isFinite(value) ? value : 0)),
    );

    return final;
  }
}
