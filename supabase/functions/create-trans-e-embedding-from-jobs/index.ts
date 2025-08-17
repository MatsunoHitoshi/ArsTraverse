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
const EPOCHS_PER_BATCH = 40;

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
        }
      } catch (error) {
        console.warn("Failed to restore model state, starting fresh:", error);
      }
    }

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

      const entityEmbeddings = transE.getAllEntityEmbeddings();
      const relationEmbeddings = transE.getAllRelationEmbeddings();

      // 各ノードの埋め込みをデータベースに保存
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

        // 埋め込みをデータベースに保存
        const { error: updateError } = await supabaseAdmin
          .from("GraphNode")
          .update({
            transEEmbedding: contextualEmbedding,
            // 最小限のメタデータのみ保存（重複情報は除外）
            // embeddingContext: {
            //   generatedAt: new Date().toISOString(),
            //   embeddingType: "contextual_transE",
            //   baseDimensions: config.dimensions,
            //   totalDimensions: contextualEmbedding.length,
            // },
          })
          .eq("id", nodeId);

        if (updateError) {
          console.error(
            `Failed to update embedding for node ID: ${nodeId}`,
            updateError,
          );
          // 個別のエラーでも処理を継続
        }
      }

      // 各リレーションの埋め込みをデータベースに保存
      for (const [relationType, baseEmbedding] of relationEmbeddings) {
        // リレーションの文脈情報を取得（最初に見つかったものを使用）
        const edge = edges.find((e) => e.type === relationType);
        if (!edge) {
          console.warn(`Edge not found for type: ${relationType}`);
          continue;
        }

        // 文脈情報を含む埋め込みを生成
        const contextualEmbedding = generateContextualEmbedding(baseEmbedding, {
          type: relationType,
          properties: edge.properties,
          topicSpaceId: topicSpaceId,
        });

        console.log(
          `Relation ${relationType} embedding: Base=${baseEmbedding.length}, Contextual=${contextualEmbedding.length}`,
        );

        // 同じtypeを持つ全てのリレーションに埋め込みを適用
        const { error: updateError } = await supabaseAdmin
          .from("GraphRelationship")
          .update({
            transEEmbedding: contextualEmbedding,
            // 最小限のメタデータのみ保存（重複情報は除外）
            // embeddingContext: {
            //   generatedAt: new Date().toISOString(),
            //   embeddingType: "contextual_transE",
            //   baseDimensions: config.dimensions,
            //   totalDimensions: contextualEmbedding.length,
            // },
          })
          .eq("type", relationType)
          .eq("topicSpaceId", topicSpaceId);

        if (updateError) {
          console.error(
            `Failed to update embedding for relation type: ${relationType}`,
            updateError,
          );
          // 個別のエラーでも処理を継続
        }
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
