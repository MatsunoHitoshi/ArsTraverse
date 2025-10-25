export interface ClusteringParameters {
  algorithm: "KMEANS" | "DBSCAN" | "HIERARCHICAL";
  // K-means固有パラメータ
  nClusters?: number; // K-means用（必須）
  useElbowMethod?: boolean; // エルボー法を使用するかどうか
  elbowMethodRange?: { min: number; max: number }; // エルボー法の探索範囲
  // DBSCAN固有パラメータ
  eps?: number; // DBSCAN用（必須）
  minSamples?: number; // DBSCAN用（必須）
  // 階層的クラスタリング固有パラメータ
  linkage?: "ward" | "complete" | "average" | "single"; // 階層的クラスタリング用
}

// アルゴリズム固有のパラメータ型
export interface KMeansParameters extends ClusteringParameters {
  algorithm: "KMEANS";
  nClusters: number; // 必須（エルボー法使用時は動的に決定）
  useElbowMethod?: boolean;
  elbowMethodRange?: { min: number; max: number };
}

export interface DBSCANParameters extends ClusteringParameters {
  algorithm: "DBSCAN";
  eps: number; // 必須
  minSamples: number; // 必須
}

export interface HierarchicalParameters extends ClusteringParameters {
  algorithm: "HIERARCHICAL";
  nClusters: number; // 必須
  linkage: "ward" | "complete" | "average" | "single"; // 必須
}

export interface ClusterResult {
  clusterId: number;
  centerX: number;
  centerY: number;
  size: number;
  annotationIds: string[];
  features?: {
    avgSentiment?: number;
    dominantType?: string;
    participants?: string[];
    timeRange?: { start: Date; end: Date };
  };
}

export interface ClusteringResult {
  clusters: ClusterResult[];
  algorithm: string;
  parameters: ClusteringParameters;
  qualityMetrics?: {
    silhouetteScore?: number;
    inertia?: number;
    calinskiHarabaszScore?: number;
    elbowMethodResult?: { optimalK: number; inertias: number[] };
  };
}

export class ClusteringService {
  /**
   * パラメータの妥当性を検証
   */
  validateParameters(params: ClusteringParameters): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    switch (params.algorithm) {
      case "KMEANS":
        if (!params.nClusters || params.nClusters < 2) {
          errors.push("K-meansのnClustersは2以上である必要があります");
        }
        if (params.nClusters && params.nClusters > 20) {
          errors.push("K-meansのnClustersは20以下である必要があります");
        }
        break;

      case "DBSCAN":
        if (!params.eps || params.eps <= 0) {
          errors.push("DBSCANのepsは0より大きい必要があります");
        }
        if (!params.minSamples || params.minSamples < 2) {
          errors.push("DBSCANのminSamplesは2以上である必要があります");
        }
        if (params.eps && params.eps > 2.0) {
          errors.push("DBSCANのepsは2.0以下である必要があります");
        }
        if (params.minSamples && params.minSamples > 20) {
          errors.push("DBSCANのminSamplesは20以下である必要があります");
        }
        break;

      case "HIERARCHICAL":
        if (!params.nClusters || params.nClusters < 2) {
          errors.push(
            "階層的クラスタリングのnClustersは2以上である必要があります",
          );
        }
        if (!params.linkage) {
          errors.push("階層的クラスタリングのlinkageは必須です");
        }
        if (params.nClusters && params.nClusters > 20) {
          errors.push(
            "階層的クラスタリングのnClustersは20以下である必要があります",
          );
        }
        break;

      default:
        errors.push(
          `サポートされていないアルゴリズム: ${String(params.algorithm)}`,
        );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * デフォルトパラメータを取得
   */
  getDefaultParameters(
    algorithm: "KMEANS" | "DBSCAN" | "HIERARCHICAL",
  ): ClusteringParameters {
    switch (algorithm) {
      case "KMEANS":
        return {
          algorithm: "KMEANS",
          nClusters: 5,
        };
      case "DBSCAN":
        return {
          algorithm: "DBSCAN",
          eps: 0.15, // より細かいクラスター形成のための調整値
          minSamples: 3, // より厳密なクラスター形成
        };
      case "HIERARCHICAL":
        return {
          algorithm: "HIERARCHICAL",
          nClusters: 5,
          linkage: "ward",
        };
      default:
        throw new Error(
          `サポートされていないアルゴリズム: ${String(algorithm)}`,
        );
    }
  }

  /**
   * システム全体のデフォルトアルゴリズムを取得
   */
  getSystemDefaultAlgorithm(): "KMEANS" | "DBSCAN" | "HIERARCHICAL" {
    return "DBSCAN";
  }
  /**
   * K-meansクラスタリングを実行
   */
  async performKMeans(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    nClusters: number,
    maxIterations = 100,
    useElbowMethod = false,
    elbowMethodRange?: { min: number; max: number },
  ): Promise<ClusteringResult> {
    const n = coordinates.length;

    let optimalNClusters = nClusters;
    let elbowMethodResult: { optimalK: number; inertias: number[] } | undefined;

    // エルボー法を使用する場合
    if (useElbowMethod) {
      const range = elbowMethodRange ?? {
        min: 2,
        max: Math.min(10, Math.floor(n / 2)),
      };
      elbowMethodResult = await this.performElbowMethod(
        coordinates,
        range,
        maxIterations,
      );
      optimalNClusters = elbowMethodResult.optimalK;
      console.log(`エルボー法により最適なクラスタ数: ${optimalNClusters}`);
    }

    if (n < optimalNClusters) {
      throw new Error(
        `データ数（${n}）がクラスター数（${optimalNClusters}）より少ないです`,
      );
    }

    // 1. 初期クラスター中心をランダムに選択
    const centers = this.initializeKMeansCenters(coordinates, optimalNClusters);

    // 2. K-meansアルゴリズムを実行
    const { finalCenters, assignments } = this.runKMeansIterations(
      coordinates,
      centers,
      maxIterations,
    );

    // 3. クラスター結果を構築
    const clusters = this.buildClusterResults(
      coordinates,
      finalCenters,
      assignments,
    );

    // 4. 品質指標を計算
    const qualityMetrics = this.calculateKMeansQualityMetrics(
      coordinates,
      finalCenters,
      assignments,
    );

    return {
      clusters,
      algorithm: "KMEANS",
      parameters: {
        algorithm: "KMEANS",
        nClusters: optimalNClusters,
        useElbowMethod,
        elbowMethodRange,
      },
      qualityMetrics: {
        ...qualityMetrics,
        elbowMethodResult,
      },
    };
  }

  /**
   * エルボー法を実行して最適なクラスタ数を決定
   */
  private async performElbowMethod(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    range: { min: number; max: number },
    maxIterations: number,
  ): Promise<{ optimalK: number; inertias: number[] }> {
    const inertias: number[] = [];
    const kValues: number[] = [];

    console.log(`エルボー法実行: k=${range.min}から${range.max}まで`);

    // 各k値でK-meansを実行して慣性を計算
    for (let k = range.min; k <= range.max; k++) {
      try {
        const centers = this.initializeKMeansCenters(coordinates, k);
        const { finalCenters, assignments } = this.runKMeansIterations(
          coordinates,
          centers,
          maxIterations,
        );

        // 慣性（Within-Cluster Sum of Squares）を計算
        let inertia = 0;
        coordinates.forEach((point, index) => {
          const clusterId = assignments[index];
          if (clusterId !== undefined && finalCenters[clusterId]) {
            const distance = this.euclideanDistance(
              point,
              finalCenters[clusterId],
            );
            inertia += distance * distance;
          }
        });

        inertias.push(inertia);
        kValues.push(k);
        console.log(`k=${k}: inertia=${inertia.toFixed(2)}`);
      } catch (error) {
        console.warn(`k=${k}でのK-means実行に失敗:`, error);
        inertias.push(Infinity);
        kValues.push(k);
      }
    }

    // エルボー点を検出（慣性の減少率が最も急激に変化する点）
    const optimalK = this.findElbowPoint(kValues, inertias);

    console.log(`エルボー法完了: 最適なk=${optimalK}`);

    return {
      optimalK,
      inertias,
    };
  }

  /**
   * エルボー点を検出
   */
  private findElbowPoint(kValues: number[], inertias: number[]): number {
    if (inertias.length < 3) {
      return kValues[Math.floor(inertias.length / 2)] ?? 2;
    }

    // 慣性の減少率を計算
    const decreases: number[] = [];
    for (let i = 1; i < inertias.length; i++) {
      const decrease = inertias[i - 1]! - inertias[i]!;
      decreases.push(decrease);
    }

    // 減少率の変化率（2次微分に相当）を計算
    const acceleration: number[] = [];
    for (let i = 1; i < decreases.length; i++) {
      const accel = decreases[i - 1]! - decreases[i]!;
      acceleration.push(accel);
    }

    // 最大の加速度変化点をエルボー点とする
    let maxAccelIndex = 0;
    let maxAccel = acceleration[0] ?? 0;

    for (let i = 1; i < acceleration.length; i++) {
      if ((acceleration[i] ?? 0) > maxAccel) {
        maxAccel = acceleration[i] ?? 0;
        maxAccelIndex = i;
      }
    }

    // インデックスをk値に変換（+2は最初の2つのk値をスキップした分）
    const optimalK =
      kValues[maxAccelIndex + 2] ??
      kValues[Math.floor(kValues.length / 2)] ??
      2;

    console.log(
      `エルボー点検出: k=${optimalK} (加速度変化: ${maxAccel.toFixed(2)})`,
    );

    return optimalK;
  }

  /**
   * DBSCANクラスタリングを実行
   */
  async performDBSCAN(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    eps: number,
    minSamples: number,
  ): Promise<ClusteringResult> {
    // 座標の分布に基づいてepsを動的に調整
    const adjustedEps = this.calculateOptimalEps(coordinates, eps);
    const n = coordinates.length;
    const visited: boolean[] = Array.from({ length: n }, () => false);
    const assignments: number[] = Array.from({ length: n }, () => -1); // -1はノイズ
    let clusterId = 0;

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;

      visited[i] = true;
      const neighbors = this.findNeighbors(coordinates, i, adjustedEps);

      if (neighbors.length < minSamples) {
        assignments[i] = -1; // ノイズ
      } else {
        assignments[i] = clusterId;
        this.expandCluster(
          coordinates,
          i,
          neighbors,
          clusterId,
          adjustedEps,
          minSamples,
          visited,
          assignments,
        );
        clusterId++;
      }
    }

    // クラスター結果を構築
    const clusters = this.buildDBSCANResults(
      coordinates,
      assignments,
      clusterId,
    );

    return {
      clusters,
      algorithm: "DBSCAN",
      parameters: { algorithm: "DBSCAN", eps: adjustedEps, minSamples },
      qualityMetrics: this.calculateDBSCANQualityMetrics(
        coordinates,
        assignments,
      ),
    };
  }

  /**
   * 階層的クラスタリングを実行（簡易版）
   */
  async performHierarchicalClustering(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    nClusters: number,
    _linkage: "ward" | "complete" | "average" | "single" = "ward",
  ): Promise<ClusteringResult> {
    // 距離行列を計算
    const distanceMatrix = this.calculateDistanceMatrix(coordinates);

    // 階層的クラスタリングを実行（簡易版）
    const assignments = this.simpleHierarchicalClustering(
      distanceMatrix,
      nClusters,
      _linkage,
    );

    // クラスター中心を計算
    const centers = this.calculateClusterCenters(
      coordinates,
      assignments,
      nClusters,
    );

    // クラスター結果を構築
    const clusters = this.buildClusterResults(
      coordinates,
      centers,
      assignments,
    );

    return {
      clusters,
      algorithm: "HIERARCHICAL",
      parameters: { algorithm: "HIERARCHICAL", nClusters, linkage: _linkage },
      qualityMetrics: this.calculateHierarchicalQualityMetrics(
        coordinates,
        assignments,
      ),
    };
  }

  /**
   * K-meansの初期中心を選択
   */
  private initializeKMeansCenters(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    nClusters: number,
  ): Array<{ x: number; y: number }> {
    const centers: Array<{ x: number; y: number }> = [];
    const n = coordinates.length;

    // 最初の中心をランダムに選択
    const firstIndex = Math.floor(Math.random() * n);
    centers.push({
      x: coordinates[firstIndex]!.x,
      y: coordinates[firstIndex]!.y,
    });

    // K-means++アルゴリズムで残りの中心を選択
    for (let k = 1; k < nClusters; k++) {
      const distances = coordinates.map((point) => {
        const minDist = Math.min(
          ...centers.map((center) => this.euclideanDistance(point, center)),
        );
        return minDist * minDist;
      });

      const totalDistance = distances.reduce((sum, dist) => sum + dist, 0);
      let random = Math.random() * totalDistance;

      for (let i = 0; i < n; i++) {
        random -= distances[i] ?? 0;
        if (random <= 0) {
          centers.push({
            x: coordinates[i]?.x ?? 0,
            y: coordinates[i]?.y ?? 0,
          });
          break;
        }
      }
    }

    return centers;
  }

  /**
   * K-meansの反復処理
   */
  private runKMeansIterations(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    initialCenters: Array<{ x: number; y: number }>,
    maxIterations: number,
  ): { finalCenters: Array<{ x: number; y: number }>; assignments: number[] } {
    let centers = [...initialCenters];
    let assignments: number[] = [];

    for (let iter = 0; iter < maxIterations; iter++) {
      // 各点を最も近い中心に割り当て
      assignments = coordinates.map((point) => {
        let minDist = Infinity;
        let closestCenter = 0;

        centers.forEach((center, index) => {
          const dist = this.euclideanDistance(point, center);
          if (dist < minDist) {
            minDist = dist;
            closestCenter = index;
          }
        });

        return closestCenter;
      });

      // 中心を更新
      const newCenters: Array<{ x: number; y: number }> = centers.map(
        (_, centerIndex) => {
          const clusterPoints = coordinates.filter(
            (_, pointIndex) => assignments[pointIndex] === centerIndex,
          );

          if (clusterPoints.length === 0) {
            return centers[centerIndex]!; // 空のクラスターは中心を維持
          }

          const avgX =
            clusterPoints.reduce((sum, point) => sum + point.x, 0) /
            clusterPoints.length;
          const avgY =
            clusterPoints.reduce((sum, point) => sum + point.y, 0) /
            clusterPoints.length;

          return { x: avgX, y: avgY };
        },
      );

      // 収束チェック
      const converged = centers.every(
        (center, index) =>
          Math.abs(center.x - newCenters[index]!.x) < 1e-6 &&
          Math.abs(center.y - newCenters[index]!.y) < 1e-6,
      );

      centers = newCenters;

      if (converged) {
        break;
      }
    }

    return { finalCenters: centers, assignments };
  }

  /**
   * 座標の分布に基づいて最適なeps値を計算
   */
  private calculateOptimalEps(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    defaultEps: number,
  ): number {
    if (coordinates.length < 2) return defaultEps;

    // すべての点間の距離を計算
    const distances: number[] = [];
    for (let i = 0; i < coordinates.length; i++) {
      for (let j = i + 1; j < coordinates.length; j++) {
        const distance = this.euclideanDistance(
          coordinates[i]!,
          coordinates[j]!,
        );
        distances.push(distance);
      }
    }

    if (distances.length === 0) return defaultEps;

    // 距離をソート
    distances.sort((a, b) => a - b);

    // 距離の分布を分析
    const minDistance = distances[0] ?? 0;
    const maxDistance = distances[distances.length - 1] ?? 0;
    const medianDistance = distances[Math.floor(distances.length / 2)] ?? 0;

    // 座標が正規化されている場合（0-1の範囲）の調整
    const isNormalized = maxDistance <= 1.5; // 正規化されていると判断

    if (isNormalized) {
      // 正規化された座標の場合、より小さなepsを使用（細かいクラスター形成）
      const suggestedEps = Math.max(0.08, Math.min(0.25, medianDistance * 0.4));
      console.log(
        `正規化された座標を検出。調整前eps: ${defaultEps}, 調整後eps: ${suggestedEps}`,
      );
      return suggestedEps;
    } else {
      // 正規化されていない座標の場合、距離分布に基づいて調整
      const suggestedEps = Math.max(
        minDistance * 1.2,
        Math.min(maxDistance * 0.25, medianDistance * 0.8),
      );
      console.log(
        `非正規化座標を検出。調整前eps: ${defaultEps}, 調整後eps: ${suggestedEps}`,
      );
      return suggestedEps;
    }
  }

  /**
   * DBSCANの近傍を検索
   */
  private findNeighbors(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    pointIndex: number,
    eps: number,
  ): number[] {
    const neighbors: number[] = [];
    const point = coordinates[pointIndex]!;

    coordinates.forEach((otherPoint, otherIndex) => {
      if (otherIndex !== pointIndex && otherPoint) {
        const distance = this.euclideanDistance(point, otherPoint);
        if (distance <= eps) {
          neighbors.push(otherIndex);
        }
      }
    });

    return neighbors;
  }

  /**
   * DBSCANのクラスター拡張
   */
  private expandCluster(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    pointIndex: number,
    neighbors: number[],
    clusterId: number,
    eps: number,
    minSamples: number,
    visited: boolean[],
    assignments: number[],
  ): void {
    let i = 0;
    // 重複チェック用のSetを使用してパフォーマンスを向上
    const neighborsSet = new Set(neighbors);

    while (i < neighbors.length) {
      const neighborIndex = neighbors[i];

      if (neighborIndex !== undefined && !visited[neighborIndex]) {
        visited[neighborIndex] = true;
        const newNeighbors = this.findNeighbors(
          coordinates,
          neighborIndex,
          eps,
        );

        if (newNeighbors.length >= minSamples) {
          // 重複を避けるため、既にneighborsに含まれていないもののみ追加
          for (const newNeighbor of newNeighbors) {
            if (!neighborsSet.has(newNeighbor)) {
              neighbors.push(newNeighbor);
              neighborsSet.add(newNeighbor);
            }
          }
        }
      }

      if (neighborIndex !== undefined && assignments[neighborIndex] === -1) {
        assignments[neighborIndex] = clusterId;
      }

      i++;
    }
  }

  /**
   * 簡易階層的クラスタリング
   */
  private simpleHierarchicalClustering(
    distanceMatrix: number[][],
    nClusters: number,
    _linkage: string,
  ): number[] {
    const n = distanceMatrix.length;
    const assignments: number[] = Array.from({ length: n }, () => 0);

    // 簡易版：距離が近い順にクラスターを形成
    const pairs: Array<{ i: number; j: number; distance: number }> = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push({ i, j, distance: distanceMatrix[i]?.[j] ?? 0 });
      }
    }

    pairs.sort((a, b) => a.distance - b.distance);

    // 最も近いペアから順番にクラスターを形成
    let currentCluster = 0;
    const used = new Set<number>();

    for (const pair of pairs) {
      if (used.has(pair.i) || used.has(pair.j)) continue;

      assignments[pair.i] = currentCluster;
      assignments[pair.j] = currentCluster;
      used.add(pair.i);
      used.add(pair.j);

      currentCluster++;
      if (currentCluster >= nClusters) break;
    }

    // 未割り当ての点を最も近いクラスターに割り当て
    for (let i = 0; i < n; i++) {
      if (!used.has(i)) {
        let minDist = Infinity;
        let closestCluster = 0;

        for (let j = 0; j < n; j++) {
          if (i !== j && used.has(j)) {
            const dist = distanceMatrix[i]?.[j] ?? 0;
            if (dist < minDist) {
              minDist = dist;
              closestCluster = assignments[j] ?? 0;
            }
          }
        }

        assignments[i] = closestCluster;
      }
    }

    return assignments;
  }

  /**
   * 距離行列の計算
   */
  private calculateDistanceMatrix(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
  ): number[][] {
    const n = coordinates.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i]![j] = 0;
        } else {
          matrix[i]![j] = this.euclideanDistance(
            coordinates[i]!,
            coordinates[j]!,
          );
        }
      }
    }

    return matrix;
  }

  /**
   * クラスター中心の計算
   */
  private calculateClusterCenters(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    assignments: number[],
    nClusters: number,
  ): Array<{ x: number; y: number }> {
    const centers: Array<{ x: number; y: number }> = [];

    for (let clusterId = 0; clusterId < nClusters; clusterId++) {
      const clusterPoints = coordinates.filter(
        (_, index) => assignments[index] === clusterId,
      );

      if (clusterPoints.length === 0) {
        centers.push({ x: 0, y: 0 });
        continue;
      }

      const avgX =
        clusterPoints.reduce((sum, point) => sum + point.x, 0) /
        clusterPoints.length;
      const avgY =
        clusterPoints.reduce((sum, point) => sum + point.y, 0) /
        clusterPoints.length;

      centers.push({ x: avgX, y: avgY });
    }

    return centers;
  }

  /**
   * クラスター結果の構築
   */
  private buildClusterResults(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    centers: Array<{ x: number; y: number }>,
    assignments: number[],
  ): ClusterResult[] {
    const clusters: ClusterResult[] = [];

    centers.forEach((center, clusterId) => {
      const clusterPoints = coordinates.filter(
        (_, index) => assignments[index] === clusterId,
      );

      clusters.push({
        clusterId,
        centerX: center.x,
        centerY: center.y,
        size: clusterPoints.length,
        annotationIds: clusterPoints.map((point) => point.annotationId),
      });
    });

    return clusters;
  }

  /**
   * DBSCAN結果の構築
   */
  private buildDBSCANResults(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    assignments: number[],
    nClusters: number,
  ): ClusterResult[] {
    const clusters: ClusterResult[] = [];

    for (let clusterId = 0; clusterId < nClusters; clusterId++) {
      const clusterPoints = coordinates.filter(
        (_, index) => assignments[index] === clusterId,
      );

      if (clusterPoints.length === 0) continue;

      const avgX =
        clusterPoints.reduce((sum, point) => sum + point.x, 0) /
        clusterPoints.length;
      const avgY =
        clusterPoints.reduce((sum, point) => sum + point.y, 0) /
        clusterPoints.length;

      clusters.push({
        clusterId,
        centerX: avgX,
        centerY: avgY,
        size: clusterPoints.length,
        annotationIds: clusterPoints.map((point) => point.annotationId),
      });
    }

    return clusters;
  }

  /**
   * ユークリッド距離の計算
   */
  private euclideanDistance(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * K-means品質指標の計算
   */
  private calculateKMeansQualityMetrics(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    centers: Array<{ x: number; y: number }>,
    assignments: number[],
  ): { silhouetteScore: number; inertia: number } {
    // 慣性（Inertia）の計算
    let inertia = 0;
    coordinates.forEach((point, index) => {
      const clusterId = assignments[index];
      if (clusterId !== undefined) {
        const center = centers[clusterId];
        if (center) {
          const distance = this.euclideanDistance(point, center);
          inertia += distance * distance;
        }
      }
    });

    // シルエットスコアの簡易計算
    const silhouetteScore = this.calculateSilhouetteScore(
      coordinates,
      assignments,
    );

    return { silhouetteScore, inertia };
  }

  /**
   * DBSCAN品質指標の計算
   */
  private calculateDBSCANQualityMetrics(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    assignments: number[],
  ): { silhouetteScore: number } {
    const silhouetteScore = this.calculateSilhouetteScore(
      coordinates,
      assignments,
    );
    return { silhouetteScore };
  }

  /**
   * 階層的クラスタリング品質指標の計算
   */
  private calculateHierarchicalQualityMetrics(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    assignments: number[],
  ): { silhouetteScore: number } {
    const silhouetteScore = this.calculateSilhouetteScore(
      coordinates,
      assignments,
    );
    return { silhouetteScore };
  }

  /**
   * シルエットスコアの計算（簡易版）
   */
  private calculateSilhouetteScore(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    assignments: number[],
  ): number {
    const n = coordinates.length;
    if (n < 2) return 0;

    let totalSilhouette = 0;

    coordinates.forEach((point, i) => {
      const clusterId = assignments[i];

      // 同じクラスター内の平均距離
      const sameClusterPoints = coordinates.filter(
        (_, index) => assignments[index] === clusterId && index !== i,
      );

      const avgIntraClusterDistance =
        sameClusterPoints.length > 0
          ? sameClusterPoints.reduce(
              (sum, otherPoint) =>
                sum + this.euclideanDistance(point, otherPoint),
              0,
            ) / sameClusterPoints.length
          : 0;

      // 最も近い他のクラスターの平均距離
      const otherClusters = [...new Set(assignments)].filter(
        (id) => id !== clusterId,
      );
      let minAvgInterClusterDistance = Infinity;

      otherClusters.forEach((otherClusterId) => {
        const otherClusterPoints = coordinates.filter(
          (_, index) => assignments[index] === otherClusterId,
        );

        if (otherClusterPoints.length > 0) {
          const avgDistance =
            otherClusterPoints.reduce(
              (sum, otherPoint) =>
                sum + this.euclideanDistance(point, otherPoint),
              0,
            ) / otherClusterPoints.length;

          minAvgInterClusterDistance = Math.min(
            minAvgInterClusterDistance,
            avgDistance,
          );
        }
      });

      if (minAvgInterClusterDistance === Infinity) {
        minAvgInterClusterDistance = 0;
      }

      // シルエットスコアの計算
      const silhouette = minAvgInterClusterDistance - avgIntraClusterDistance;
      const maxDistance = Math.max(
        minAvgInterClusterDistance,
        avgIntraClusterDistance,
      );

      totalSilhouette += maxDistance > 0 ? silhouette / maxDistance : 0;
    });

    return totalSilhouette / n;
  }
}
