import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TransE, createTransEConfig, Triplet } from "../_shared/trans-e.ts";
import { supabaseAdmin } from "../_shared/pg-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOTAL_EPOCHS = 200;
const EPOCHS_PER_BATCH = 20;

// 文脈情報をエンコードするヘルパー関数
function encodeContextualInfo(context: any): number[] {
  const contextVector: number[] = [];

  // ラベル情報を数値化（簡単なハッシュ関数）
  if (context.label) {
    const labelHash = context.label
      .split("")
      .reduce((acc: number, char: string) => {
        return acc + char.charCodeAt(0);
      }, 0);
    contextVector.push((labelHash % 100) / 100); // 0-1の範囲に正規化
  } else {
    contextVector.push(0);
  }

  // トピックスペースIDを数値化
  if (context.topicSpaceId) {
    const spaceHash = context.topicSpaceId
      .split("")
      .reduce((acc: number, char: string) => {
        return acc + char.charCodeAt(0);
      }, 0);
    contextVector.push((spaceHash % 100) / 100);
  } else {
    contextVector.push(0);
  }

  // プロパティ情報を数値化（JSONの文字列長から簡易的な特徴量を生成）
  if (context.properties) {
    const propsStr = JSON.stringify(context.properties);
    contextVector.push(Math.min(propsStr.length / 1000, 1)); // 0-1の範囲に正規化
  } else {
    contextVector.push(0);
  }

  return contextVector;
}

// 文脈情報を含む埋め込みを生成する関数
function generateContextualEmbedding(
  baseEmbedding: number[],
  context: any,
): number[] {
  const contextVector = encodeContextualInfo(context);

  // 文脈ベクトルは5次元に制限
  const limitedContextVector = contextVector.slice(0, 5);

  // ベース埋め込みを45次元に調整（文脈ベクトルの5次元を引く）
  // 45次元未満の場合は0でパディング、45次元を超える場合は切り詰め
  let adjustedBaseEmbedding: number[];
  if (baseEmbedding.length < 45) {
    // 45次元未満の場合は0でパディング
    adjustedBaseEmbedding = [
      ...baseEmbedding,
      ...Array(45 - baseEmbedding.length).fill(0),
    ];
  } else if (baseEmbedding.length > 45) {
    // 45次元を超える場合は切り詰め
    adjustedBaseEmbedding = baseEmbedding.slice(0, 45);
  } else {
    // ちょうど45次元の場合
    adjustedBaseEmbedding = baseEmbedding;
  }

  // 文脈ベクトルも5次元に調整（不足分は0でパディング）
  const paddedContextVector = [
    ...limitedContextVector,
    ...Array(5 - limitedContextVector.length).fill(0),
  ];

  console.log(
    `Contextual embedding: Base dimensions: ${adjustedBaseEmbedding.length}, Context dimensions: ${paddedContextVector.length}, Total: ${adjustedBaseEmbedding.length + paddedContextVector.length}`,
  );

  // 合計50次元のベクトルを返す
  return [...adjustedBaseEmbedding, ...paddedContextVector];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ジョブを取得して処理
    const job = await getJobToProcess(supabaseAdmin);
    if (!job) {
      return new Response(JSON.stringify({ message: "No jobs to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ジョブを処理
    const result = await processJob(supabaseAdmin, job);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function getJobToProcess(supabaseAdmin: any) {
  // PENDINGジョブを取得
  const { data: pendingJobs } = await supabaseAdmin
    .from("GraphEmbeddingQueue")
    .select("*")
    .eq("status", "PENDING")
    .order("createdAt")
    .limit(1);

  console.log("pendingJobs: ", pendingJobs);

  if (pendingJobs && pendingJobs.length > 0) {
    return pendingJobs[0];
  }

  // 古いPROCESSINGジョブをチェック
  const staleTime = new Date(Date.now() - 35 * 1000).toISOString(); // 35秒前
  const { data: staleJobs } = await supabaseAdmin
    .from("GraphEmbeddingQueue")
    .select("*")
    .eq("status", "PROCESSING")
    .lt("updatedAt", staleTime)
    .order("createdAt")
    .limit(1);

  console.log("staleJobs: ", staleJobs);

  return staleJobs && staleJobs.length > 0 ? staleJobs[0] : null;
}

async function processJob(supabaseAdmin: any, job: any) {
  const jobId = job.id;
  const topicSpaceId = job.topicSpaceId;
  const processedEpochs = job.processedEpochs || 0;
  const modelStatePath = job.modelStatePath;

  console.log(
    `Processing job ${jobId} for topic space ${topicSpaceId}. Current progress: ${processedEpochs}/${TOTAL_EPOCHS} epochs.`,
  );

  // ジョブをPROCESSINGに更新
  await supabaseAdmin
    .from("GraphEmbeddingQueue")
    .update({
      status: "PROCESSING",
      startedAt: job.startedAt || new Date().toISOString(),
    })
    .eq("id", jobId);

  try {
    // グラフデータを取得
    const { data: nodes, error: nodesError } = await supabaseAdmin
      .from("GraphNode")
      .select("id, name, label, properties")
      .eq("topicSpaceId", topicSpaceId)
      .is("deletedAt", null);

    const { data: edges, error: edgesError } = await supabaseAdmin
      .from("GraphRelationship")
      .select("id, fromNodeId, toNodeId, type, properties")
      .eq("topicSpaceId", topicSpaceId)
      .is("deletedAt", null);

    if (nodesError || edgesError) {
      throw new Error(`Database error: ${nodesError || edgesError}`);
    }

    if (!nodes || !edges || nodes.length === 0 || edges.length === 0) {
      throw new Error("No nodes or edges found for the topic space");
    }

    console.log(`Found ${nodes.length} nodes and ${edges.length} edges`);
    console.log(`Sample node context:`, {
      label: nodes[0]?.label,
      properties: nodes[0]?.properties,
      topicSpaceId: topicSpaceId,
    });
    console.log(
      `Note: Context information (label, properties, topicSpaceId) is already stored in existing columns`,
    );
    console.log(
      `Only embedding generation metadata will be saved in embeddingContext`,
    );

    // トリプレットを構築（IDベース管理）
    const triplets: Triplet[] = edges.map((edge) => ({
      head: edge.fromNodeId, // ノードIDを使用
      relation: edge.type, // リレーションタイプ
      tail: edge.toNodeId, // ノードIDを使用
    }));

    // エンティティとリレーションのリストを作成（IDベース管理）
    const entities = nodes.map((node) => node.id); // ノードIDを使用
    const relations = [...new Set(edges.map((edge) => edge.type))]; // リレーションタイプ

    // TransE設定を作成（文脈情報を含む埋め込み用に調整）
    // ベース埋め込み: 45次元 + 文脈情報: 5次元 = 合計50次元
    // 注意: データベースのtransEEmbeddingカラムは50次元を期待
    const config = createTransEConfig({
      dimensions: 45, // ベース埋め込みの次元数（文脈情報の5次元を引く）
      epochs: EPOCHS_PER_BATCH,
      batchSize: Math.min(1000, triplets.length),
      learningRate: 0.01,
      margin: 1.0,
    });

    console.log(
      `Contextual embedding: Base dimensions: ${config.dimensions}, Context dimensions: 5, Total: ${config.dimensions + 5}`,
    );
    console.log(`TransE configuration:`, {
      dimensions: config.dimensions,
      epochs: config.epochs,
      batchSize: config.batchSize,
      learningRate: config.learningRate,
      margin: config.margin,
    });

    // TransEインスタンスを作成
    const transE = new TransE(config);

    // 初期化を実行（埋め込みの準備）
    console.log(
      `Starting initialization with ${entities.length} entities and ${relations.length} relations`,
    );
    transE.initialize(entities, relations);

    // 既存のモデル状態を復元（ある場合）
    if (processedEpochs > 0 && modelStatePath) {
      try {
        console.log(`Restoring model from ${modelStatePath}...`);
        const { data: modelData } = await supabaseAdmin.storage
          .from("embedding-models")
          .download(modelStatePath);

        if (modelData) {
          const modelState = JSON.parse(await modelData.text());
          transE.loadModel(modelState);
          console.log("Model state restored successfully");

          // 復元後の状態をチェック
          const restoredEntityEmbeddings = transE.getAllEntityEmbeddings();
          const restoredRelationEmbeddings = transE.getAllRelationEmbeddings();
          console.log(
            `After restoration: ${restoredEntityEmbeddings.size} entities, ${restoredRelationEmbeddings.size} relations`,
          );
        }
      } catch (error) {
        console.warn("Failed to restore model state, starting fresh:", error);
        // 復元に失敗した場合は新しく初期化
        console.log("Re-initializing embeddings after restoration failure...");
        transE.initialize(entities, relations);
      }
    } else {
      // 新規学習の場合は初期化のみ
      console.log("Starting fresh training - no model state to restore");
    }

    // 初期化後の状態を詳細にチェック
    const entityEmbeddings = transE.getAllEntityEmbeddings();
    const relationEmbeddings = transE.getAllRelationEmbeddings();

    console.log(`Initialization completed. Verification:`);
    console.log(
      `- Expected entities: ${entities.length}, Actual: ${entityEmbeddings.size}`,
    );
    console.log(
      `- Expected relations: ${relations.length}, Actual: ${relationEmbeddings.size}`,
    );

    // 初期化の問題をチェック
    const missingEntities = entities.filter(
      (entity) => !entityEmbeddings.has(entity),
    );
    const missingRelations = relations.filter(
      (relation) => !relationEmbeddings.has(relation),
    );

    if (missingEntities.length > 0) {
      console.warn(
        `Missing entity embeddings after initialization: ${missingEntities.length}`,
      );
      console.warn(`Sample missing entities:`, missingEntities.slice(0, 5));
    }

    if (missingRelations.length > 0) {
      console.warn(
        `Missing relation embeddings after initialization: ${missingRelations.length}`,
      );
      console.warn(`Sample missing relations:`, missingRelations.slice(0, 5));
    }

    // 初期化が不完全な場合はエラー
    if (
      entityEmbeddings.size !== entities.length ||
      relationEmbeddings.size !== relations.length
    ) {
      throw new Error(
        `Initialization incomplete. Expected: ${entities.length} entities, ${relations.length} relations. ` +
          `Actual: ${entityEmbeddings.size} entities, ${relationEmbeddings.size} relations. ` +
          `Missing: ${missingEntities.length} entities, ${missingRelations.length} relations`,
      );
    }

    console.log(
      `Initialization verified successfully. All embeddings are ready.`,
    );

    // 学習開始前の最終チェック
    console.log(`Final verification before training:`);
    const finalEntityEmbeddings = transE.getAllEntityEmbeddings();
    const finalRelationEmbeddings = transE.getAllRelationEmbeddings();

    // トリプレットの各要素が埋め込みを持っているかチェック
    const tripletsWithMissingEmbeddings = triplets.filter((triplet) => {
      const hasHead = finalEntityEmbeddings.has(triplet.head);
      const hasTail = finalEntityEmbeddings.has(triplet.tail);
      const hasRelation = finalRelationEmbeddings.has(triplet.relation);

      if (!hasHead || !hasTail || !hasRelation) {
        console.warn(`Triplet with missing embeddings:`, {
          triplet,
          hasHead,
          hasTail,
          hasRelation,
        });
        return true;
      }
      return false;
    });

    if (tripletsWithMissingEmbeddings.length > 0) {
      console.error(
        `Found ${tripletsWithMissingEmbeddings.length} triplets with missing embeddings before training`,
      );
      console.error(
        `This indicates an initialization problem. Aborting training.`,
      );
      throw new Error(
        `Cannot start training: ${tripletsWithMissingEmbeddings.length} triplets have missing embeddings. ` +
          `Initialization verification failed.`,
      );
    }

    console.log(`All triplets verified. Training can proceed safely.`);

    // 学習を実行
    let finalLoss = 0;
    await transE.train(triplets, entities, relations, (epoch, loss) => {
      finalLoss = loss;
      console.log(`Epoch ${epoch}: Loss = ${loss.toFixed(4)}`);
    });

    // 新しいエポック数を計算
    const newProcessedEpochs = processedEpochs + config.epochs;

    if (newProcessedEpochs >= TOTAL_EPOCHS) {
      // 学習完了 - 埋め込みを保存
      console.log("Training complete. Saving final embeddings...");
      const saveStartTime = Date.now();

      const entityEmbeddings = transE.getAllEntityEmbeddings();
      const relationEmbeddings = transE.getAllRelationEmbeddings();

      // バッチ書き込み用のデータを準備
      const nodeUpdates = [];
      const relationUpdates = [];

      // 各ノードの埋め込みを準備
      for (const [nodeId, baseEmbedding] of entityEmbeddings) {
        // ノードの文脈情報を取得
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          console.warn(`Node not found for ID: ${nodeId}`);
          continue;
        }

        // 文脈情報を含む埋め込みを生成
        const contextualEmbedding = generateContextualEmbedding(baseEmbedding, {
          label: node.label,
          properties: node.properties,
          topicSpaceId: topicSpaceId,
        });

        console.log(
          `Node ${nodeId} embedding: Base=${baseEmbedding.length}, Contextual=${contextualEmbedding.length}`,
        );

        // バッチ更新用のデータを準備
        nodeUpdates.push({
          id: nodeId,
          transEEmbedding: contextualEmbedding,
          // 最小限のメタデータのみ保存（重複情報は除外）
          // embeddingContext: {
          //   generatedAt: new Date().toISOString(),
          //   algorithm: "TransE",
          //   version: "1.0",
          //   baseDimensions: baseEmbedding.length,
          //   contextualDimensions: contextualEmbedding.length,
          // },
        });
      }

      // 各リレーションの埋め込みを準備
      for (const [relationType, baseEmbedding] of relationEmbeddings) {
        // リレーションの文脈情報を取得
        const edge = edges.find((e) => e.type === relationType);
        if (!edge) {
          console.warn(`Edge not found for type: ${relationType}`);
          continue;
        }

        // 文脈情報を含む埋め込みを生成
        const contextualEmbedding = generateContextualEmbedding(baseEmbedding, {
          type: edge.type,
          properties: edge.properties,
          topicSpaceId: topicSpaceId,
        });

        console.log(
          `Relation ${relationType} embedding: Base=${baseEmbedding.length}, Contextual=${contextualEmbedding.length}`,
        );

        // バッチ更新用のデータを準備
        relationUpdates.push({
          id: edge.id,
          transEEmbedding: contextualEmbedding,
          // 最小限のメタデータのみ保存（重複情報は除外）
          // embeddingContext: {
          //   generatedAt: new Date().toISOString(),
          //   algorithm: "TransE",
          //   version: "1.0",
          //   baseDimensions: baseEmbedding.length,
          //   contextualDimensions: contextualEmbedding.length,
          // },
        });
      }

      console.log(
        `Prepared ${nodeUpdates.length} node updates and ${relationUpdates.length} relation updates`,
      );

      // データの整合性チェック
      const invalidNodes = nodeUpdates.filter(
        (item) =>
          !item.id ||
          !item.transEEmbedding ||
          !Array.isArray(item.transEEmbedding),
      );
      const invalidRelations = relationUpdates.filter(
        (item) =>
          !item.id ||
          !item.transEEmbedding ||
          !Array.isArray(item.transEEmbedding),
      );

      if (invalidNodes.length > 0) {
        console.warn(
          `Found ${invalidNodes.length} invalid node updates:`,
          invalidNodes.slice(0, 3),
        );
      }
      if (invalidRelations.length > 0) {
        console.warn(
          `Found ${invalidRelations.length} invalid relation updates:`,
          invalidRelations.slice(0, 3),
        );
      }

      // 有効なデータのみを処理
      const validNodeUpdates = nodeUpdates.filter(
        (item) =>
          item.id &&
          item.transEEmbedding &&
          Array.isArray(item.transEEmbedding),
      );
      const validRelationUpdates = relationUpdates.filter(
        (item) =>
          item.id &&
          item.transEEmbedding &&
          Array.isArray(item.transEEmbedding),
      );

      console.log(
        `Processing ${validNodeUpdates.length} valid node updates and ${validRelationUpdates.length} valid relation updates`,
      );

      // バッチ書き込みを実行（ノード）
      if (validNodeUpdates.length > 0) {
        console.log(
          `Saving ${validNodeUpdates.length} node embeddings in batches...`,
        );
        const batchSize = 50; // 100から50に削減してネットワーク負荷を軽減
        const batches = [];

        for (let i = 0; i < validNodeUpdates.length; i += batchSize) {
          const batch = validNodeUpdates.slice(i, i + batchSize);
          batches.push(batch);
        }

        // 並列処理でバッチ書き込みを実行（最大2つまで並列に制限）
        const maxConcurrent = 2; // 3から2に削減してネットワーク負荷を軽減
        for (let i = 0; i < batches.length; i += maxConcurrent) {
          const concurrentBatches = batches.slice(i, i + maxConcurrent);
          console.log(
            `Processing node batches ${i + 1}-${Math.min(i + maxConcurrent, batches.length)} of ${batches.length} concurrently`,
          );

          const batchPromises = concurrentBatches.map(
            async (batch, batchIndex) => {
              // 各アイテムを個別に更新（リトライ機能付き）
              const updatePromises = batch.map(async (item) => {
                try {
                  const success = await updateWithRetry(
                    supabaseAdmin,
                    "GraphNode",
                    item.id,
                    { transEEmbedding: item.transEEmbedding },
                  );

                  if (!success) {
                    console.warn(
                      `Failed to update node ${item.id} after retries, skipping...`,
                    );
                    return 0; // 失敗した場合は0を返す（スキップ）
                  }

                  return 1;
                } catch (error) {
                  console.warn(
                    `Exception updating node ${item.id}, skipping...:`,
                    error.message,
                  );
                  return 0; // エラーの場合も0を返す（スキップ）
                }
              });

              try {
                const results = await Promise.all(updatePromises);
                const successCount = results.reduce(
                  (sum, count) => sum + count,
                  0,
                );
                const failedCount = batch.length - successCount;

                if (failedCount > 0) {
                  console.warn(
                    `Batch ${i + batchIndex + 1}: ${successCount} succeeded, ${failedCount} failed`,
                  );
                }

                return successCount;
              } catch (error) {
                console.error(
                  `Batch ${i + batchIndex + 1} failed completely:`,
                  error,
                );
                return 0; // バッチ全体が失敗した場合は0を返す
              }
            },
          );

          const results = await Promise.all(batchPromises);
          const totalProcessed = results.reduce((sum, count) => sum + count, 0);
          console.log(
            `Completed ${totalProcessed} node embeddings in this round`,
          );
        }
        console.log("All node embeddings saved successfully");
      }

      // バッチ書き込みを実行（リレーション）
      if (validRelationUpdates.length > 0) {
        console.log(
          `Saving ${validRelationUpdates.length} relation embeddings in batches...`,
        );
        const batchSize = 50; // 100から50に削減してネットワーク負荷を軽減
        const batches = [];

        for (let i = 0; i < validRelationUpdates.length; i += batchSize) {
          const batch = validRelationUpdates.slice(i, i + batchSize);
          batches.push(batch);
        }

        // 並列処理でバッチ書き込みを実行（最大2つまで並列に制限）
        const maxConcurrent = 2; // 3から2に削減してネットワーク負荷を軽減
        for (let i = 0; i < batches.length; i += maxConcurrent) {
          const concurrentBatches = batches.slice(i, i + maxConcurrent);
          console.log(
            `Processing relation batches ${i + 1}-${Math.min(i + maxConcurrent, batches.length)} of ${batches.length} concurrently`,
          );

          const batchPromises = concurrentBatches.map(
            async (batch, batchIndex) => {
              // 各アイテムを個別に更新（リトライ機能付き）
              const updatePromises = batch.map(async (item) => {
                try {
                  const success = await updateWithRetry(
                    supabaseAdmin,
                    "GraphRelationship",
                    item.id,
                    { transEEmbedding: item.transEEmbedding },
                  );

                  if (!success) {
                    console.warn(
                      `Failed to update relation ${item.id} after retries, skipping...`,
                    );
                    return 0; // 失敗した場合は0を返す（スキップ）
                  }

                  return 1;
                } catch (error) {
                  console.warn(
                    `Exception updating relation ${item.id}, skipping...:`,
                    error.message,
                  );
                  return 0; // エラーの場合も0を返す（スキップ）
                }
              });

              try {
                const results = await Promise.all(updatePromises);
                const successCount = results.reduce(
                  (sum, count) => sum + count,
                  0,
                );
                const failedCount = batch.length - successCount;

                if (failedCount > 0) {
                  console.warn(
                    `Batch ${i + batchIndex + 1}: ${successCount} succeeded, ${failedCount} failed`,
                  );
                }

                return successCount;
              } catch (error) {
                console.error(
                  `Batch ${i + batchIndex + 1} failed completely:`,
                  error,
                );
                return 0; // バッチ全体が失敗した場合は0を返す
              }
            },
          );

          const results = await Promise.all(batchPromises);
          const totalProcessed = results.reduce((sum, count) => sum + count, 0);
          console.log(
            `Completed ${totalProcessed} relation embeddings in this round`,
          );
        }
        console.log("All relation embeddings saved successfully");
      }

      const saveElapsedTime = Date.now() - saveStartTime;
      console.log(`Database save completed in ${saveElapsedTime}ms`);

      if (saveElapsedTime > 8000) {
        console.warn(
          `Warning: Database save took ${saveElapsedTime}ms, approaching CPU time limit`,
        );
      }

      // ジョブを完了としてマーク
      await supabaseAdmin
        .from("GraphEmbeddingQueue")
        .update({
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
          processedEpochs: newProcessedEpochs,
        })
        .eq("id", jobId);

      // モデルファイルを削除（フォルダごと削除）
      if (modelStatePath) {
        try {
          // フォルダパスを抽出（例: "jobId/model_epoch_40.json" → "jobId/"）
          const folderPath =
            modelStatePath.split("/").slice(0, -1).join("/") + "/";

          console.log(`Removing model folder: ${folderPath}`);

          // フォルダ内の全ファイルを取得
          const { data: files, error: listError } = await supabaseAdmin.storage
            .from("embedding-models")
            .list(folderPath);

          if (listError) {
            console.warn("Failed to list files in folder:", listError);
          } else if (files && files.length > 0) {
            // フォルダ内の全ファイルを削除
            const filePaths = files.map((file) => folderPath + file.name);
            console.log(`Removing ${filePaths.length} files:`, filePaths);

            const { error: removeError } = await supabaseAdmin.storage
              .from("embedding-models")
              .remove(filePaths);

            if (removeError) {
              console.warn("Failed to remove model files:", removeError);
            } else {
              console.log(
                `Successfully removed ${filePaths.length} model files`,
              );
            }
          } else {
            console.log("No files found in model folder");
          }
        } catch (error) {
          console.warn("Failed to remove model folder:", error);
        }
      }

      console.log(`Successfully completed job ${jobId}`);

      return {
        message: "Job completed successfully",
        jobId,
        nodesProcessed: nodes.length,
        edgesProcessed: edges.length,
        finalLoss: finalLoss,
        totalEpochs: newProcessedEpochs,
      };
    } else {
      // 中間状態を保存して継続
      console.log(
        `Batch finished. Progress: ${newProcessedEpochs}/${TOTAL_EPOCHS}. Saving model state...`,
      );

      const modelState = transE.saveModel();
      const modelStateJson = JSON.stringify(modelState);

      // モデル状態をストレージに保存
      const newModelPath = `${jobId}/model_epoch_${newProcessedEpochs}.json`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("embedding-models")
        .upload(newModelPath, modelStateJson, {
          contentType: "application/json",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to save model state: ${uploadError.message}`);
      }

      // ジョブの進捗を更新
      await supabaseAdmin
        .from("GraphEmbeddingQueue")
        .update({
          processedEpochs: newProcessedEpochs,
          modelStatePath: newModelPath,
        })
        .eq("id", jobId);

      console.log(`Job ${jobId} state saved. Will continue in next run.`);

      return {
        message: "Batch completed, job will continue",
        jobId,
        nodesProcessed: nodes.length,
        edgesProcessed: edges.length,
        currentEpochs: newProcessedEpochs,
        totalEpochs: TOTAL_EPOCHS,
      };
    }
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);

    // エラーが発生した場合
    await supabaseAdmin
      .from("GraphEmbeddingQueue")
      .update({
        status: "FAILED",
        error: error.message,
      })
      .eq("id", jobId);

    throw error;
  }
}

// リトライ機能付きの更新関数
async function updateWithRetry(
  supabaseAdmin: any,
  table: string,
  id: string,
  data: any,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error: updateError } = await supabaseAdmin
        .from(table)
        .update(data)
        .eq("id", id);

      if (updateError) {
        // データベースエラーの場合はリトライしない
        if (
          updateError.message.includes("constraint") ||
          updateError.message.includes("not-null") ||
          updateError.message.includes("foreign key")
        ) {
          throw updateError;
        }

        // ネットワークエラーの場合はリトライ
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // 指数バックオフ
          console.warn(
            `Attempt ${attempt} failed for ${table} ${id}, retrying in ${delay}ms:`,
            updateError.message,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw updateError;
      }

      return true; // 成功
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // ネットワークエラーの場合はリトライ
      if (
        error.message.includes("error sending request") ||
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `Network error on attempt ${attempt} for ${table} ${id}, retrying in ${delay}ms:`,
          error.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // その他のエラーは即座に投げる
      throw error;
    }
  }

  return false;
}
