export interface ClusteringParameters {
  algorithm: "KMEANS" | "DBSCAN" | "HIERARCHICAL";
  nClusters?: number; // K-means用
  eps?: number; // DBSCAN用
  minSamples?: number; // DBSCAN用
  linkage?: "ward" | "complete" | "average" | "single"; // 階層的クラスタリング用
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
  };
}

export class ClusteringService {
  /**
   * K-meansクラスタリングを実行
   */
  async performKMeans(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    nClusters: number,
    maxIterations = 100,
  ): Promise<ClusteringResult> {
    const n = coordinates.length;
    if (n < nClusters) {
      throw new Error(
        `データ数（${n}）がクラスター数（${nClusters}）より少ないです`,
      );
    }

    // 1. 初期クラスター中心をランダムに選択
    const centers = this.initializeKMeansCenters(coordinates, nClusters);

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
      parameters: { algorithm: "KMEANS", nClusters },
      qualityMetrics,
    };
  }

  /**
   * DBSCANクラスタリングを実行
   */
  async performDBSCAN(
    coordinates: Array<{ x: number; y: number; annotationId: string }>,
    eps: number,
    minSamples: number,
  ): Promise<ClusteringResult> {
    const n = coordinates.length;
    const visited: boolean[] = Array.from({ length: n }, () => false);
    const assignments: number[] = Array.from({ length: n }, () => -1); // -1はノイズ
    let clusterId = 0;

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;

      visited[i] = true;
      const neighbors = this.findNeighbors(coordinates, i, eps);

      if (neighbors.length < minSamples) {
        assignments[i] = -1; // ノイズ
      } else {
        assignments[i] = clusterId;
        this.expandCluster(
          coordinates,
          i,
          neighbors,
          clusterId,
          eps,
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
      parameters: { algorithm: "DBSCAN", eps, minSamples },
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
    while (i < neighbors.length) {
      const neighborIndex = neighbors[i];

      if (neighborIndex && !visited[neighborIndex]) {
        visited[neighborIndex] = true;
        const newNeighbors = this.findNeighbors(
          coordinates,
          neighborIndex,
          eps,
        );

        if (newNeighbors.length >= minSamples) {
          neighbors.push(...newNeighbors);
        }
      }

      if (neighborIndex && assignments[neighborIndex] === -1) {
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
