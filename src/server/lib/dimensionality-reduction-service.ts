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
    // 入力データの検証
    this.validateInput(features, annotationIds);

    const {
      nNeighbors = 15,
      minDist = 0.1,
      spread = 1.0,
      nComponents = 2,
      randomSeed = 42,
    } = parameters;

    // ランダムシードを設定
    this.setRandomSeed(randomSeed);

    // データポイント数に応じてnNeighborsを調整
    const dataPoints = features.length;
    const adjustedNNeighbors = Math.min(
      nNeighbors,
      Math.max(2, dataPoints - 1),
    );

    // データポイントが少なすぎる場合は簡易的な座標生成
    if (dataPoints < 3) {
      const coordinates = this.generateRandomCoordinates(
        features,
        annotationIds,
        randomSeed,
      );

      return {
        coordinates,
        annotationIds,
        parameters: {
          nNeighbors: adjustedNNeighbors,
          minDist,
          spread,
          nComponents,
          randomSeed,
        },
        qualityMetrics: {
          trustworthiness: 0,
          continuity: 0,
        },
      };
    }

    try {
      // 特徴量の前処理
      const processedFeatures = this.preprocessFeatures(features);

      // UMAPインスタンスを作成
      const umap = new UMAP({
        nNeighbors: adjustedNNeighbors,
        minDist,
        spread,
        nComponents,
        // randomSeedは別途設定
      });

      // UMAPを実行
      const embedding = umap.fit(processedFeatures);

      // 結果を2次元座標に変換
      const rawCoordinates = embedding.map((point, index) => ({
        x: point[0] ?? 0,
        y: point[1] ?? 0,
        annotationId: annotationIds[index] ?? "",
      }));

      // 座標を正規化（0-1の範囲にスケール）
      const coordinates = this.normalizeCoordinates(rawCoordinates);

      // 品質指標を計算
      const qualityMetrics = this.calculateQualityMetrics(
        processedFeatures,
        embedding,
      );

      return {
        coordinates,
        annotationIds,
        parameters: {
          nNeighbors: adjustedNNeighbors,
          minDist,
          spread,
          nComponents,
          randomSeed,
        },
        qualityMetrics,
      };
    } catch (error) {
      console.error("UMAP実行エラー:", error);

      // より詳細なエラーメッセージを提供
      if (error instanceof Error) {
        if (error.message.includes("memory")) {
          throw new Error(
            `メモリ不足によりUMAP実行に失敗しました。データサイズを小さくするか、パラメータを調整してください: ${error.message}`,
          );
        } else if (error.message.includes("dimension")) {
          throw new Error(
            `次元数の問題によりUMAP実行に失敗しました。特徴量の次元数を確認してください: ${error.message}`,
          );
        } else {
          throw new Error(`UMAP実行に失敗しました: ${error.message}`);
        }
      } else {
        throw new Error(`UMAP実行に失敗しました: ${String(error)}`);
      }
    }
  }

  /**
   * 座標を0-1の範囲に正規化
   */
  private normalizeCoordinates(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
  ): Array<{ x: number; y: number; annotationId: string }> {
    if (coordinates.length === 0) return coordinates;

    // X座標とY座標の最小値・最大値を取得
    const xValues = coordinates.map((c) => c.x);
    const yValues = coordinates.map((c) => c.y);

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    // 範囲が0の場合はそのまま返す
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    if (rangeX === 0 && rangeY === 0) {
      return coordinates.map((c) => ({ ...c, x: 0.5, y: 0.5 }));
    }

    // 0-1の範囲に正規化
    return coordinates.map((coord) => ({
      ...coord,
      x: rangeX === 0 ? 0.5 : (coord.x - minX) / rangeX,
      y: rangeY === 0 ? 0.5 : (coord.y - minY) / rangeY,
    }));
  }

  /**
   * 入力データの検証
   */
  private validateInput(features: number[][], annotationIds: string[]): void {
    if (!features || features.length === 0) {
      throw new Error("特徴量データが空です");
    }

    if (!annotationIds || annotationIds.length === 0) {
      throw new Error("アノテーションIDが空です");
    }

    if (features.length !== annotationIds.length) {
      throw new Error(
        `特徴量データ数(${features.length})とアノテーションID数(${annotationIds.length})が一致しません`,
      );
    }

    // 特徴量の次元数をチェック
    const firstFeatureLength = features[0]?.length ?? 0;
    if (firstFeatureLength === 0) {
      throw new Error("特徴量の次元数が0です");
    }

    // 全ての特徴量が同じ次元数かチェック
    for (let i = 1; i < features.length; i++) {
      if (features[i]?.length !== firstFeatureLength) {
        throw new Error(
          `特徴量${i}の次元数(${features[i]?.length})が最初の特徴量の次元数(${firstFeatureLength})と一致しません`,
        );
      }
    }
  }

  /**
   * ランダムシードの設定
   */
  private setRandomSeed(seed: number): void {
    // Node.js環境でのランダムシード設定
    if (typeof global !== "undefined" && global.Math) {
      // 簡易的なシード設定（実際のプロダクションではより堅牢な実装が必要）
      Math.random = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
    }
  }

  /**
   * ランダム座標の生成（再現可能）
   */
  private generateRandomCoordinates(
    features: number[][],
    annotationIds: string[],
    seed: number,
  ): Array<{ x: number; y: number; annotationId: string }> {
    // シードベースのランダム生成
    let currentSeed = seed;
    const random = () => {
      const x = Math.sin(currentSeed++) * 10000;
      return x - Math.floor(x);
    };

    return features.map((_, index) => ({
      x: random() * 100,
      y: random() * 100,
      annotationId: annotationIds[index] ?? "",
    }));
  }

  /**
   * 品質指標の計算（改善版）
   */
  private calculateQualityMetrics(
    originalFeatures: number[][],
    embedding: number[][],
  ): { trustworthiness: number; continuity: number } {
    const n = originalFeatures.length;
    if (n < 2) {
      return { trustworthiness: 0, continuity: 0 };
    }

    // 元の特徴量空間での距離行列
    const originalDistances = this.calculateDistanceMatrix(originalFeatures);

    // 埋め込み空間での距離行列
    const embeddingDistances = this.calculateDistanceMatrix(embedding);

    // 信頼性指標の計算（改善版）
    let trustworthinessSum = 0;
    let continuitySum = 0;
    let count = 0;

    // k近傍の数を決定（データサイズに応じて調整）
    const k = Math.min(Math.max(2, Math.floor(n / 10)), 10);

    for (let i = 0; i < n; i++) {
      // 元の空間でのk近傍を取得
      const originalNeighbors = this.getKNearestNeighbors(
        originalDistances[i]!,
        k,
        i,
      );

      // 埋め込み空間でのk近傍を取得
      const embeddingNeighbors = this.getKNearestNeighbors(
        embeddingDistances[i]!,
        k,
        i,
      );

      // 信頼性: 埋め込み空間で近い点が元の空間でも近いか
      let trustworthiness = 0;
      for (const neighbor of embeddingNeighbors) {
        if (originalNeighbors.includes(neighbor)) {
          trustworthiness += 1;
        }
      }
      trustworthinessSum += trustworthiness / k;

      // 連続性: 元の空間で近い点が埋め込み空間でも近いか
      let continuity = 0;
      for (const neighbor of originalNeighbors) {
        if (embeddingNeighbors.includes(neighbor)) {
          continuity += 1;
        }
      }
      continuitySum += continuity / k;

      count++;
    }

    return {
      trustworthiness: count > 0 ? trustworthinessSum / count : 0,
      continuity: count > 0 ? continuitySum / count : 0,
    };
  }

  /**
   * k近傍の取得
   */
  private getKNearestNeighbors(
    distances: number[],
    k: number,
    excludeIndex: number,
  ): number[] {
    const indexedDistances = distances
      .map((dist, index) => ({ dist, index }))
      .filter((_, index) => index !== excludeIndex)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);

    return indexedDistances.map((item) => item.index);
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
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
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
