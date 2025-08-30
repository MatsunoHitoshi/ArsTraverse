// TransE (Translation-based Embedding) アルゴリズムの実装
// 知識グラフのエンティティとリレーションをベクトル空間に埋め込む

export interface Triplet {
  head: string;
  relation: string;
  tail: string;
}

export interface TransEConfig {
  dimensions: number;
  learningRate: number;
  margin: number;
  epochs: number;
  batchSize: number;
}

export class TransE {
  private entityEmbeddings: Map<string, number[]>;
  private relationEmbeddings: Map<string, number[]>;
  private config: TransEConfig;

  constructor(config: TransEConfig) {
    this.config = config;
    this.entityEmbeddings = new Map();
    this.relationEmbeddings = new Map();
  }

  /**
   * ランダムなベクトルを生成（Xavier初期化）
   */
  private generateRandomVector(dimensions: number): number[] {
    const vector = new Array(dimensions);
    const scale = Math.sqrt(6.0 / dimensions);

    for (let i = 0; i < dimensions; i++) {
      vector[i] = (Math.random() - 0.5) * 2 * scale;
    }

    return vector;
  }

  /**
   * ベクトルのL2正規化
   */
  private normalizeVector(vector: number[]): void {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }

  /**
   * 2つのベクトル間のユークリッド距離を計算
   */
  private distance(vector1: number[], vector2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector1.length; i++) {
      const diff = vector1[i] - vector2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * 2つのベクトルを加算する
   */
  private addVectors(vector1: number[], vector2: number[]): number[] {
    // ベクトルデータの型チェック（本番環境での安全性のため復活）
    if (!Array.isArray(vector1) || !Array.isArray(vector2)) {
      throw new Error(
        `Invalid vector format: vector1 is ${typeof vector1}, vector2 is ${typeof vector2}`,
      );
    }

    if (vector1.length !== vector2.length) {
      throw new Error(
        `Vector length mismatch: vector1 length is ${vector1.length}, vector2 length is ${vector2.length}`,
      );
    }

    return vector1.map((val, i) => val + vector2[i]);
  }

  /**
   * 2つのベクトルを減算する
   */
  private subtractVectors(vector1: number[], vector2: number[]): number[] {
    // ベクトルデータの型チェック（本番環境での安全性のため復活）
    if (!Array.isArray(vector1) || !Array.isArray(vector2)) {
      throw new Error(
        `Invalid vector format: vector1 is ${typeof vector1}, vector2 is ${typeof vector2}`,
      );
    }

    if (vector1.length !== vector2.length) {
      throw new Error(
        `Vector length mismatch: vector1 length is ${vector1.length}, vector2 length is ${vector2.length}`,
      );
    }

    return vector1.map((val, i) => val - vector2[i]);
  }

  /**
   * ベクトルのスカラー倍
   */
  private scaleVector(vector: number[], scale: number): number[] {
    return vector.map((val) => val * scale);
  }

  /**
   * モデルを初期化
   */
  initialize(entities: string[], relations: string[]): void {
    // 既存の埋め込みがある場合は初期化をスキップ
    if (this.entityEmbeddings.size > 0 && this.relationEmbeddings.size > 0) {
      console.log(
        `Skipping initialization - existing embeddings found: ${this.entityEmbeddings.size} entities, ${this.relationEmbeddings.size} relations`,
      );

      // 既存の埋め込みの状態を確認（本番環境での安全性のため）
      const sampleEntity = Array.from(this.entityEmbeddings.entries())[0];
      const sampleRelation = Array.from(this.relationEmbeddings.entries())[0];

      if (sampleEntity) {
        console.log(
          `Sample entity embedding: ${sampleEntity[0]} -> ${sampleEntity[1].length} dimensions`,
        );
      }
      if (sampleRelation) {
        console.log(
          `Sample relation embedding: ${sampleRelation[0]} -> ${sampleRelation[1].length} dimensions`,
        );
      }

      return;
    }

    console.log(
      `Initializing TransE with ${entities.length} entities and ${relations.length} relations`,
    );

    // エンティティ埋め込みの初期化
    entities.forEach((entity) => {
      this.entityEmbeddings.set(
        entity,
        this.generateRandomVector(this.config.dimensions),
      );
    });

    // リレーション埋め込みの初期化
    relations.forEach((relation) => {
      this.relationEmbeddings.set(
        relation,
        this.generateRandomVector(this.config.dimensions),
      );
    });

    console.log(
      `Initialization complete. Embedding dimensions: ${this.config.dimensions}`,
    );

    // 初期化後の状態確認（本番環境での安全性のため）
    console.log(
      `Final state: ${this.entityEmbeddings.size} entities, ${this.relationEmbeddings.size} relations`,
    );
  }

  /**
   * すべての埋め込みベクトルを正規化
   */
  private normalizeAllEmbeddings(): void {
    this.entityEmbeddings.forEach((vector) => this.normalizeVector(vector));
    this.relationEmbeddings.forEach((vector) => this.normalizeVector(vector));
  }

  /**
   * 負例トリプレットを生成する
   */
  private generateNegativeTriplet(
    positiveTriplet: Triplet,
    entities: string[],
  ): Triplet {
    const negativeTriplet = { ...positiveTriplet };

    // 実際に埋め込みが存在するエンティティのみを対象とする（本番環境での安全性のため）
    const availableEntities = entities.filter((entity) =>
      this.entityEmbeddings.has(entity),
    );

    if (availableEntities.length === 0) {
      throw new Error(
        `No available entities with embeddings found. ` +
          `Requested entities: ${entities.length}, ` +
          `Entities with embeddings: ${this.entityEmbeddings.size}`,
      );
    }

    // 正例のheadとtailの両方と異なるエンティティのみを対象とする
    const validEntities = availableEntities.filter(
      (entity) =>
        entity !== positiveTriplet.head && entity !== positiveTriplet.tail,
    );

    if (validEntities.length === 0) {
      throw new Error(
        `No valid entities available for negative sampling. ` +
          `Positive triplet: ${JSON.stringify(positiveTriplet)}, ` +
          `Available entities: ${availableEntities.length}`,
      );
    }

    // 50%の確率でheadまたはtailをランダムなエンティティに置換
    if (Math.random() < 0.5) {
      // headを置換（正例のheadとtailの両方と異なるエンティティを選択）
      const newHead =
        validEntities[Math.floor(Math.random() * validEntities.length)];
      negativeTriplet.head = newHead;
    } else {
      // tailを置換（正例のheadとtailの両方と異なるエンティティを選択）
      const newTail =
        validEntities[Math.floor(Math.random() * validEntities.length)];
      negativeTriplet.tail = newTail;
    }

    return negativeTriplet;
  }

  /**
   * 単一のトリプレットで学習を行う
   */
  private trainTriplet(
    positiveTriplet: Triplet,
    negativeTriplet: Triplet,
  ): number {
    const headPos = this.entityEmbeddings.get(positiveTriplet.head);
    const relation = this.relationEmbeddings.get(positiveTriplet.relation);
    const tailPos = this.entityEmbeddings.get(positiveTriplet.tail);

    const headNeg = this.entityEmbeddings.get(negativeTriplet.head);
    const tailNeg = this.entityEmbeddings.get(negativeTriplet.tail);

    // 埋め込みの存在チェック（本番環境での安全性のため復活）
    if (!headPos || !relation || !tailPos || !headNeg || !tailNeg) {
      const missingEmbeddings = [];
      if (!headPos) missingEmbeddings.push(`head: ${positiveTriplet.head}`);
      if (!relation)
        missingEmbeddings.push(`relation: ${positiveTriplet.relation}`);
      if (!tailPos) missingEmbeddings.push(`tail: ${positiveTriplet.tail}`);
      if (!headNeg)
        missingEmbeddings.push(`negative head: ${negativeTriplet.head}`);
      if (!tailNeg)
        missingEmbeddings.push(`negative tail: ${negativeTriplet.tail}`);

      // より詳細なエラー情報を提供
      const availableEntities = Array.from(this.entityEmbeddings.keys()).slice(
        0,
        5,
      );
      const availableRelations = Array.from(
        this.relationEmbeddings.keys(),
      ).slice(0, 5);

      throw new Error(
        `Missing embeddings for triplet training: ${missingEmbeddings.join(
          ", ",
        )}. ` +
          `Available entities: ${this.entityEmbeddings.size}, relations: ${this.relationEmbeddings.size}. ` +
          `Sample available entities: [${availableEntities.join(", ")}]. ` +
          `Sample available relations: [${availableRelations.join(", ")}]. ` +
          `Positive triplet: ${JSON.stringify(positiveTriplet)}, ` +
          `Negative triplet: ${JSON.stringify(negativeTriplet)}`,
      );
    }

    // 正例のスコア: ||h + r - t||
    const positiveScore = this.distance(
      this.addVectors(headPos, relation),
      tailPos,
    );

    // 負例のスコア: ||h + r - t||
    const negativeScore = this.distance(
      this.addVectors(headNeg, relation),
      tailNeg,
    );

    // マージンランキング損失
    const loss = Math.max(
      0,
      this.config.margin + positiveScore - negativeScore,
    );

    if (loss > 0) {
      // 勾配を計算してベクトルを更新
      this.updateEmbeddings(
        positiveTriplet,
        negativeTriplet,
        positiveScore,
        negativeScore,
      );
    }

    return loss;
  }

  /**
   * 埋め込みベクトルを更新（修正版）
   */
  private updateEmbeddings(
    positiveTriplet: Triplet,
    negativeTriplet: Triplet,
    positiveScore: number,
    negativeScore: number,
  ): void {
    const learningRate = this.config.learningRate;

    // 正例の更新
    const headPos = this.entityEmbeddings.get(positiveTriplet.head)!;
    const relation = this.relationEmbeddings.get(positiveTriplet.relation)!;
    const tailPos = this.entityEmbeddings.get(positiveTriplet.tail)!;

    // 負例の更新
    const headNeg = this.entityEmbeddings.get(negativeTriplet.head)!;
    const tailNeg = this.entityEmbeddings.get(negativeTriplet.tail)!;

    // 埋め込みの存在チェック（本番環境での安全性のため復活）
    if (!headPos || !relation || !tailPos || !headNeg || !tailNeg) {
      const missingEmbeddings = [];
      if (!headPos)
        missingEmbeddings.push(`positive head: ${positiveTriplet.head}`);
      if (!relation)
        missingEmbeddings.push(`relation: ${positiveTriplet.relation}`);
      if (!tailPos)
        missingEmbeddings.push(`positive tail: ${positiveTriplet.tail}`);
      if (!headNeg)
        missingEmbeddings.push(`negative head: ${negativeTriplet.head}`);
      if (!tailNeg)
        missingEmbeddings.push(`negative tail: ${negativeTriplet.tail}`);

      throw new Error(
        `Missing embeddings for update: ${missingEmbeddings.join(", ")}. ` +
          `Available entities: ${this.entityEmbeddings.size}, relations: ${this.relationEmbeddings.size}`,
      );
    }

    // 正例の勾配計算（修正版）
    if (positiveScore > 0) {
      // 勾配の大きさを制限（数値安定性のため）
      const gradient = Math.min(
        learningRate / Math.max(positiveScore, 0.1),
        learningRate * 10,
      );

      // head + relation - tail の差分ベクトル
      const diff = this.subtractVectors(
        this.addVectors(headPos, relation),
        tailPos,
      );

      // 正例のベクトルを更新（正例のスコアを小さくする方向）
      this.updateVector(headPos, this.scaleVector(diff, -gradient));
      this.updateVector(relation, this.scaleVector(diff, -gradient));
      this.updateVector(tailPos, this.scaleVector(diff, gradient));
    }

    // 負例の勾配計算（修正版）
    if (negativeScore > 0) {
      // 勾配の大きさを制限
      const gradient = Math.min(
        learningRate / Math.max(negativeScore, 0.1),
        learningRate * 10,
      );

      const diff = this.subtractVectors(
        this.addVectors(headNeg, relation),
        tailNeg,
      );

      // 負例のベクトルを更新（負例のスコアを大きくする方向）
      this.updateVector(headNeg, this.scaleVector(diff, gradient));
      this.updateVector(relation, this.scaleVector(diff, gradient));
      this.updateVector(tailNeg, this.scaleVector(diff, -gradient));
    }
  }

  /**
   * ベクトルを更新
   */
  private updateVector(vector: number[], gradient: number[]): void {
    for (let i = 0; i < vector.length; i++) {
      vector[i] += gradient[i];
    }
  }

  /**
   * バッチで学習を行う
   */
  trainBatch(triplets: Triplet[], entities: string[]): number {
    // 渡されたentities配列と実際の埋め込みの整合性をチェック（本番環境での安全性のため）
    const missingEntities = entities.filter(
      (entity) => !this.entityEmbeddings.has(entity),
    );
    if (missingEntities.length > 0) {
      console.warn(
        `Warning: ${missingEntities.length} entities in the entities array do not have embeddings: ` +
          `${missingEntities.slice(0, 5).join(", ")}${missingEntities.length > 5 ? "..." : ""}. ` +
          `Entities array size: ${entities.length}, Available embeddings: ${this.entityEmbeddings.size}`,
      );
    }

    // 実際に埋め込みが存在するエンティティのみを使用
    const availableEntities = entities.filter((entity) =>
      this.entityEmbeddings.has(entity),
    );

    if (availableEntities.length === 0) {
      throw new Error(
        `No entities with embeddings available for training. ` +
          `Entities array size: ${entities.length}, Available embeddings: ${this.entityEmbeddings.size}`,
      );
    }

    console.log(
      `Training batch with ${triplets.length} triplets using ${availableEntities.length}/${entities.length} available entities`,
    );

    let totalLoss = 0;
    let processedTriplets = 0;
    let skippedTriplets = 0;

    triplets.forEach((triplet) => {
      try {
        // トリプレットの全エンティティとリレーションに埋め込みが存在するかチェック
        if (
          !this.entityEmbeddings.has(triplet.head) ||
          !this.entityEmbeddings.has(triplet.tail) ||
          !this.relationEmbeddings.has(triplet.relation)
        ) {
          console.warn(
            `Skipping triplet due to missing embeddings: head=${triplet.head}, relation=${triplet.relation}, tail=${triplet.tail}`,
          );
          skippedTriplets++;
          return;
        }

        const negativeTriplet = this.generateNegativeTriplet(
          triplet,
          availableEntities,
        );
        const loss = this.trainTriplet(triplet, negativeTriplet);
        totalLoss += loss;
        processedTriplets++;
      } catch (error) {
        console.warn(
          `Error processing triplet ${JSON.stringify(triplet)}: ${error.message}. Skipping...`,
        );
        skippedTriplets++;
      }
    });

    if (processedTriplets === 0) {
      throw new Error(
        `No triplets could be processed in this batch. ` +
          `Total triplets: ${triplets.length}, Skipped: ${skippedTriplets}`,
      );
    }

    console.log(
      `Batch completed: ${processedTriplets} processed, ${skippedTriplets} skipped out of ${triplets.length} total`,
    );

    return totalLoss / processedTriplets;
  }

  /**
   * 完全な学習を実行
   */
  async train(
    triplets: Triplet[],
    entities: string[],
    relations: string[],
    onProgress?: (epoch: number, loss: number) => void,
  ): Promise<void> {
    // 初期化（既存の埋め込みがある場合はスキップ）
    this.initialize(entities, relations);

    // 学習開始前の状態確認
    console.log(`Training state before start:`);
    console.log(`- Entity embeddings: ${this.entityEmbeddings.size}`);
    console.log(`- Relation embeddings: ${this.relationEmbeddings.size}`);
    console.log(
      `- First entity dimensions: ${Array.from(this.entityEmbeddings.values())[0]?.length || "N/A"}`,
    );
    console.log(
      `- First relation dimensions: ${Array.from(this.relationEmbeddings.values())[0]?.length || "N/A"}`,
    );

    // 渡された配列と実際の埋め込みの整合性をチェック（本番環境での安全性のため）
    const missingEntities = entities.filter(
      (entity) => !this.entityEmbeddings.has(entity),
    );
    const missingRelations = relations.filter(
      (relation) => !this.relationEmbeddings.has(relation),
    );

    if (missingEntities.length > 0) {
      console.warn(
        `Warning: ${missingEntities.length} entities in the entities array do not have embeddings: ` +
          `${missingEntities.slice(0, 5).join(", ")}${missingEntities.length > 5 ? "..." : ""}. ` +
          `Entities array size: ${entities.length}, Available embeddings: ${this.entityEmbeddings.size}`,
      );
    }

    if (missingRelations.length > 0) {
      console.warn(
        `Warning: ${missingRelations.length} relations in the relations array do not have embeddings: ` +
          `${missingRelations.slice(0, 5).join(", ")}${missingRelations.length > 5 ? "..." : ""}. ` +
          `Relations array size: ${relations.length}, Available embeddings: ${this.relationEmbeddings.size}`,
      );
    }

    // 実際に埋め込みが存在するエンティティとリレーションのみを使用
    const availableEntities = entities.filter((entity) =>
      this.entityEmbeddings.has(entity),
    );
    const availableRelations = relations.filter((relation) =>
      this.relationEmbeddings.has(relation),
    );

    if (availableEntities.length === 0) {
      throw new Error(
        `No entities with embeddings available for training. ` +
          `Entities array size: ${entities.length}, Available embeddings: ${this.entityEmbeddings.size}`,
      );
    }

    if (availableRelations.length === 0) {
      throw new Error(
        `No relations with embeddings available for training. ` +
          `Relations array size: ${relations.length}, Available embeddings: ${this.relationEmbeddings.size}`,
      );
    }

    console.log(
      `Starting TransE training with ${triplets.length} triplets, ` +
        `${availableEntities.length}/${entities.length} available entities, ` +
        `${availableRelations.length}/${relations.length} available relations`,
    );

    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      // トリプレットをシャッフル
      const shuffledTriplets = [...triplets].sort(() => Math.random() - 0.5);

      // バッチ処理
      let totalLoss = 0;
      const batchCount = Math.ceil(
        shuffledTriplets.length / this.config.batchSize,
      );

      for (let i = 0; i < batchCount; i++) {
        const start = i * this.config.batchSize;
        const end = Math.min(
          start + this.config.batchSize,
          shuffledTriplets.length,
        );
        const batch = shuffledTriplets.slice(start, end);

        try {
          const batchLoss = this.trainBatch(batch, availableEntities);
          totalLoss += batchLoss;
        } catch (error) {
          console.warn(
            `Error in batch ${i + 1}/${batchCount}: ${error.message}. Continuing with next batch...`,
          );
          // バッチエラーの場合はスキップして続行
          continue;
        }
      }

      const avgLoss = totalLoss / batchCount;

      // 進捗コールバック
      if (onProgress) {
        onProgress(epoch, avgLoss);
      }

      // 5エポックごとに正規化（学習の安定性のため）
      if (epoch % 5 === 0) {
        this.normalizeAllEmbeddings();
      }

      // 早期停止チェック（損失が十分に小さくなった場合）
      if (avgLoss < 0.01) {
        console.log(`Early stopping at epoch ${epoch} with loss ${avgLoss}`);
        break;
      }

      // 10エポックごとにログ出力
      if (epoch % 10 === 0) {
        console.log(
          `Epoch ${epoch}/${this.config.epochs}, Loss: ${avgLoss.toFixed(4)}`,
        );
      }
    }

    console.log("TransE training completed");
  }

  /**
   * エンティティの埋め込みベクトルを取得
   */
  getEntityEmbedding(entity: string): number[] | undefined {
    return this.entityEmbeddings.get(entity);
  }

  /**
   * リレーションの埋め込みベクトルを取得
   */
  getRelationEmbedding(relation: string): number[] | undefined {
    return this.relationEmbeddings.get(relation);
  }

  /**
   * すべてのエンティティ埋め込みを取得
   */
  getAllEntityEmbeddings(): Map<string, number[]> {
    return new Map(this.entityEmbeddings);
  }

  /**
   * すべてのリレーション埋め込みを取得
   */
  getAllRelationEmbeddings(): Map<string, number[]> {
    return new Map(this.relationEmbeddings);
  }

  /**
   * モデルの状態を保存（簡易版）
   */
  saveModel(): any {
    const entityCount = this.entityEmbeddings.size;
    const relationCount = this.relationEmbeddings.size;

    // デバッグ情報を追加
    console.log(
      `Saving model state: ${entityCount} entities, ${relationCount} relations`,
    );

    // 最初の埋め込みベクトルの次元数を確認
    const firstEntity = Array.from(this.entityEmbeddings.values())[0];
    const firstRelation = Array.from(this.relationEmbeddings.values())[0];

    if (firstEntity && firstRelation) {
      console.log(
        `Embedding dimensions - Entity: ${firstEntity.length}, Relation: ${firstRelation.length}`,
      );
      console.log(
        `Sample entity embedding: [${firstEntity
          .slice(0, 3)
          .map((x) => x.toFixed(4))
          .join(", ")}...]`,
      );
      console.log(
        `Sample relation embedding: [${firstRelation
          .slice(0, 3)
          .map((x) => x.toFixed(4))
          .join(", ")}...]`,
      );
    }

    return {
      entityEmbeddings: Object.fromEntries(this.entityEmbeddings),
      relationEmbeddings: Object.fromEntries(this.relationEmbeddings),
      config: this.config,
    };
  }

  /**
   * モデルの状態を復元（簡易版）
   */
  loadModel(modelData: any): void {
    console.log(`Loading model state...`);

    // 復元前の状態を記録
    const beforeEntityCount = this.entityEmbeddings.size;
    const beforeRelationCount = this.relationEmbeddings.size;

    this.entityEmbeddings = new Map(Object.entries(modelData.entityEmbeddings));
    this.relationEmbeddings = new Map(
      Object.entries(modelData.relationEmbeddings),
    );
    this.config = modelData.config;

    // 復元後の状態を確認
    const afterEntityCount = this.entityEmbeddings.size;
    const afterRelationCount = this.relationEmbeddings.size;

    console.log(
      `Model restored: Entities ${beforeEntityCount} → ${afterEntityCount}, Relations ${beforeRelationCount} → ${afterRelationCount}`,
    );

    // 復元された埋め込みの詳細を確認
    const firstEntity = Array.from(this.entityEmbeddings.values())[0];
    const firstRelation = Array.from(this.relationEmbeddings.values())[0];

    if (firstEntity && firstRelation) {
      console.log(
        `Restored embedding dimensions - Entity: ${firstEntity.length}, Relation: ${firstRelation.length}`,
      );
      console.log(
        `Restored sample entity: [${firstEntity
          .slice(0, 3)
          .map((x) => x.toFixed(4))
          .join(", ")}...]`,
      );
      console.log(
        `Restored sample relation: [${firstRelation
          .slice(0, 3)
          .map((x) => x.toFixed(4))
          .join(", ")}...]`,
      );
    }

    // 正規化を実行して一貫性を保つ
    console.log(`Normalizing restored embeddings...`);
    this.normalizeAllEmbeddings();

    // 正規化後の状態を確認
    const normalizedFirstEntity = Array.from(this.entityEmbeddings.values())[0];
    const normalizedFirstRelation = Array.from(
      this.relationEmbeddings.values(),
    )[0];

    if (normalizedFirstEntity && normalizedFirstRelation) {
      console.log(
        `After normalization - Entity: [${normalizedFirstEntity
          .slice(0, 3)
          .map((x) => x.toFixed(4))
          .join(", ")}...]`,
      );
      console.log(
        `After normalization - Relation: [${normalizedFirstRelation
          .slice(0, 3)
          .map((x) => x.toFixed(4))
          .join(", ")}...]`,
      );
    }
  }
}

/**
 * デフォルト設定
 */
export const DEFAULT_TRANSE_CONFIG: TransEConfig = {
  dimensions: 128,
  learningRate: 0.01,
  margin: 1.0,
  epochs: 1000,
  batchSize: 1000,
};

/**
 * 設定をカスタマイズするヘルパー関数
 */
export function createTransEConfig(
  overrides: Partial<TransEConfig> = {},
): TransEConfig {
  return { ...DEFAULT_TRANSE_CONFIG, ...overrides };
}

/**
 * 学習済み埋め込み表現をDBから読み込んで予測のみを行うクラス
 * 学習タスクとは別のランタイムで実行されることを想定
 */
export class TransEPredictor {
  private entityEmbeddings: Map<string, number[]>;
  private relationEmbeddings: Map<string, number[]>;
  private config: TransEConfig;

  constructor(
    config: TransEConfig,
    entityEmbeddings?: Map<string, number[]>,
    relationEmbeddings?: Map<string, number[]>,
  ) {
    this.config = config;
    this.entityEmbeddings = entityEmbeddings || new Map();
    this.relationEmbeddings = relationEmbeddings || new Map();
  }

  /**
   * 埋め込み表現を設定
   */
  setEmbeddings(
    entityEmbeddings: Map<string, number[]>,
    relationEmbeddings: Map<string, number[]>,
  ): void {
    this.entityEmbeddings = entityEmbeddings;
    this.relationEmbeddings = relationEmbeddings;
  }

  /**
   * 埋め込み表現が正しく読み込まれているかチェック
   */
  isReady(): boolean {
    return this.entityEmbeddings.size > 0 && this.relationEmbeddings.size > 0;
  }

  /**
   * 利用可能なエンティティの一覧を取得
   */
  getAvailableEntities(): string[] {
    return Array.from(this.entityEmbeddings.keys());
  }

  /**
   * 利用可能なリレーションの一覧を取得
   */
  getAvailableRelations(): string[] {
    return Array.from(this.relationEmbeddings.keys());
  }

  /**
   * 埋め込み表現の統計情報を取得
   */
  getEmbeddingStats(): {
    entityCount: number;
    relationCount: number;
    dimensions: number;
  } {
    const firstEntity = Array.from(this.entityEmbeddings.values())[0];
    const dimensions = firstEntity ? firstEntity.length : 0;

    return {
      entityCount: this.entityEmbeddings.size,
      relationCount: this.relationEmbeddings.size,
      dimensions,
    };
  }

  // 予測メソッド（TransEクラスと同じ実装）
  /**
   * リンク予測: 与えられたheadとrelationからtailを予測
   */
  predictTail(
    head: string,
    relation: string,
    topK: number = 10,
  ): Array<{ entity: string; score: number }> {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    const headEmbedding = this.entityEmbeddings.get(head);
    const relationEmbedding = this.relationEmbeddings.get(relation);

    if (!headEmbedding || !relationEmbedding) {
      throw new Error(
        `Embedding not found for head: ${head} or relation: ${relation}`,
      );
    }

    // ベクトルデータの型チェック
    if (!Array.isArray(headEmbedding) || !Array.isArray(relationEmbedding)) {
      throw new Error(
        `Invalid embedding format: head embedding is ${typeof headEmbedding}, relation embedding is ${typeof relationEmbedding}`,
      );
    }

    // head + relation のベクトルを計算
    const targetVector = this.addVectors(headEmbedding, relationEmbedding);

    // 全エンティティとの距離を計算してスコアリング
    const scores: Array<{ entity: string; score: number }> = [];

    for (const [entity, entityEmbedding] of this.entityEmbeddings) {
      if (entity !== head) {
        // 自分自身は除外
        const distance = this.distance(targetVector, entityEmbedding);
        const score = 1 / (1 + distance); // 距離をスコアに変換（高いほど良い）
        scores.push({ entity, score });
      }
    }

    // スコアで降順ソートして上位K件を返す
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * リンク予測: 与えられたrelationとtailからheadを予測
   */
  predictHead(
    relation: string,
    tail: string,
    topK: number = 10,
  ): Array<{ entity: string; score: number }> {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    const relationEmbedding = this.relationEmbeddings.get(relation);
    const tailEmbedding = this.entityEmbeddings.get(tail);

    if (!relationEmbedding || !tailEmbedding) {
      throw new Error(
        `Embedding not found for relation: ${relation} or tail: ${tail}`,
      );
    }

    // ベクトルデータの型チェック
    if (!Array.isArray(relationEmbedding) || !Array.isArray(tailEmbedding)) {
      throw new Error(
        `Invalid embedding format: relation embedding is ${typeof relationEmbedding}, tail embedding is ${typeof tailEmbedding}`,
      );
    }

    // tail - relation のベクトルを計算（headの位置を予測）
    const targetVector = this.subtractVectors(tailEmbedding, relationEmbedding);

    // 全エンティティとの距離を計算してスコアリング
    const scores: Array<{ entity: string; score: number }> = [];

    for (const [entity, entityEmbedding] of this.entityEmbeddings) {
      if (entity !== tail) {
        // 自分自身は除外
        const distance = this.distance(targetVector, entityEmbedding);
        const score = 1 / (1 + distance); // 距離をスコアに変換（高いほど良い）
        scores.push({ entity, score });
      }
    }

    // スコアで降順ソートして上位K件を返す
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * リンク予測: 与えられたheadとtailからrelationを予測
   */
  predictRelation(
    head: string,
    tail: string,
    topK: number = 10,
  ): Array<{ relation: string; score: number }> {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    const headEmbedding = this.entityEmbeddings.get(head);
    const tailEmbedding = this.entityEmbeddings.get(tail);

    if (!headEmbedding || !tailEmbedding) {
      throw new Error(`Embedding not found for head: ${head} or tail: ${tail}`);
    }

    // tail - head のベクトルを計算（relationの位置を予測）
    const targetVector = this.subtractVectors(tailEmbedding, headEmbedding);

    // 全リレーションとの距離を計算してスコアリング
    const scores: Array<{ relation: string; score: number }> = [];

    for (const [relation, relationEmbedding] of this.relationEmbeddings) {
      const distance = this.distance(targetVector, relationEmbedding);
      const score = 1 / (1 + distance); // 距離をスコアに変換（高いほど良い）
      scores.push({ relation, score });
    }

    // スコアで降順ソートして上位K件を返す
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * トリプレットの妥当性スコアを計算
   */
  calculateTripletScore(head: string, relation: string, tail: string): number {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    const headEmbedding = this.entityEmbeddings.get(head);
    const relationEmbedding = this.relationEmbeddings.get(relation);
    const tailEmbedding = this.entityEmbeddings.get(tail);

    if (!headEmbedding || !relationEmbedding || !tailEmbedding) {
      throw new Error(
        `Embedding not found for head: ${head}, relation: ${relation}, or tail: ${tail}`,
      );
    }

    // TransEの基本式: ||h + r - t|| の距離を計算
    const distance = this.distance(
      this.addVectors(headEmbedding, relationEmbedding),
      tailEmbedding,
    );

    // 距離をスコアに変換（距離が小さいほど高いスコア）
    return 1 / (1 + distance);
  }

  /**
   * 類似エンティティを検索
   */
  findSimilarEntities(
    entity: string,
    topK: number = 10,
  ): Array<{ entity: string; similarity: number }> {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    const entityEmbedding = this.entityEmbeddings.get(entity);

    if (!entityEmbedding) {
      throw new Error(`Embedding not found for entity: ${entity}`);
    }

    const similarities: Array<{ entity: string; similarity: number }> = [];

    for (const [otherEntity, otherEmbedding] of this.entityEmbeddings) {
      if (otherEntity !== entity) {
        // コサイン類似度を計算
        const similarity = this.cosineSimilarity(
          entityEmbedding,
          otherEmbedding,
        );
        similarities.push({ entity: otherEntity, similarity });
      }
    }

    // 類似度で降順ソートして上位K件を返す
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * 類似リレーションを検索
   */
  findSimilarRelations(
    relation: string,
    topK: number = 10,
  ): Array<{ relation: string; similarity: number }> {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    const relationEmbedding = this.relationEmbeddings.get(relation);

    if (!relationEmbedding) {
      throw new Error(`Embedding not found for relation: ${relation}`);
    }

    const similarities: Array<{ relation: string; similarity: number }> = [];

    for (const [otherRelation, otherEmbedding] of this.relationEmbeddings) {
      if (otherRelation !== relation) {
        // コサイン類似度を計算
        const similarity = this.cosineSimilarity(
          relationEmbedding,
          otherEmbedding,
        );
        similarities.push({ relation: otherRelation, similarity });
      }
    }

    // 類似度で降順ソートして上位K件を返す
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * 知識グラフの完全性を評価
   */
  evaluateGraphCompleteness(testTriplets: Triplet[]): {
    meanRank: number;
    hitsAt10: number;
    meanReciprocalRank: number;
  } {
    if (!this.isReady()) {
      throw new Error(
        "Embeddings not loaded. Call loadEmbeddingsFromDB() first.",
      );
    }

    let totalRank = 0;
    let hitsAt10 = 0;
    let totalReciprocalRank = 0;

    for (const triplet of testTriplets) {
      // head予測のランクを計算
      const headPredictions = this.predictHead(
        triplet.relation,
        triplet.tail,
        1000,
      );
      let headRank =
        headPredictions.findIndex((p) => p.entity === triplet.head) + 1;
      if (headRank === 0) headRank = 1001; // 見つからない場合

      // tail予測のランクを計算
      const tailPredictions = this.predictTail(
        triplet.head,
        triplet.relation,
        1000,
      );
      let tailRank =
        tailPredictions.findIndex((p) => p.entity === triplet.tail) + 1;
      if (tailRank === 0) tailRank = 1001; // 見つからない場合

      // 平均ランクを計算
      const avgRank = (headRank + tailRank) / 2;
      totalRank += avgRank;

      // Hits@10を計算
      if (headRank <= 10) hitsAt10++;
      if (tailRank <= 10) hitsAt10++;

      // 平均逆数ランクを計算
      totalReciprocalRank += 1 / headRank + 1 / tailRank;
    }

    const n = testTriplets.length;
    return {
      meanRank: totalRank / n,
      hitsAt10: hitsAt10 / (2 * n), // headとtailの両方を考慮
      meanReciprocalRank: totalReciprocalRank / (2 * n),
    };
  }

  // ヘルパーメソッド（TransEクラスと同じ実装）
  private distance(vector1: number[], vector2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector1.length; i++) {
      const diff = vector1[i] - vector2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  private addVectors(vector1: number[], vector2: number[]): number[] {
    // ベクトルデータの型チェック
    if (!Array.isArray(vector1) || !Array.isArray(vector2)) {
      throw new Error(
        `Invalid vector format: vector1 is ${typeof vector1}, vector2 is ${typeof vector2}`,
      );
    }

    if (vector1.length !== vector2.length) {
      throw new Error(
        `Vector length mismatch: vector1 length is ${vector1.length}, vector2 length is ${vector2.length}`,
      );
    }

    return vector1.map((val, i) => val + vector2[i]);
  }

  private subtractVectors(vector1: number[], vector2: number[]): number[] {
    // ベクトルデータの型チェック
    if (!Array.isArray(vector1) || !Array.isArray(vector2)) {
      throw new Error(
        `Invalid vector format: vector1 is ${typeof vector1}, vector2 is ${typeof vector2}`,
      );
    }

    if (vector1.length !== vector2.length) {
      throw new Error(
        `Vector length mismatch: vector1 length is ${vector1.length}, vector2 length is ${vector2.length}`,
      );
    }

    return vector1.map((val, i) => val - vector2[i]);
  }

  private cosineSimilarity(vector1: number[], vector2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }
}
