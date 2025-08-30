// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/pg-client.ts";
import { getEmbedding } from "../_shared/get-embedding.ts";
import { TransEPredictor } from "../_shared/trans-e.ts";

/**
 * Relation予測関数
 * 与えられたheadとtailから、最も可能性の高いrelationを予測します
 *
 * 入力パラメータ:
 * - head: エンティティID（head）
 * - tail: エンティティID（tail）
 * - topicSpaceId: トピックスペースID
 *
 * 戻り値:
 * - 予測されたrelationのリスト（スコア順）
 */
console.log("loading function...");

Deno.serve(
  async (req: { json: () => PromiseLike<{ query: any }> | { query: any } }) => {
    const { head, tail, topicSpaceId } = await req.json();

    console.log(
      `Predicting relations for head: ${head}, tail: ${tail}, topicSpace: ${topicSpaceId}`,
    );

    const { data: nodes, error: nodesError } = await supabaseAdmin
      .from("GraphNode")
      .select("id, name, transEEmbedding")
      .eq("topicSpaceId", topicSpaceId)
      .not("transEEmbedding", "is", null)
      .is("deletedAt", null);

    const { data: relations, error: relationsError } = await supabaseAdmin
      .from("GraphRelationship")
      .select("id, type, transEEmbedding")
      .eq("topicSpaceId", topicSpaceId)
      .not("transEEmbedding", "is", null)
      .is("deletedAt", null);

    if (nodesError || relationsError) {
      return new Response(
        JSON.stringify({ error: nodesError || relationsError }),
        {
          status: 500,
        },
      );
    }

    const entityEmbeddings = new Map();
    const relationEmbeddings = new Map();

    nodes.forEach((node: any) => {
      if (node.transEEmbedding) {
        // ベクトルデータの型チェックと変換
        let embedding = node.transEEmbedding;

        // 文字列の場合はパースを試行
        if (typeof embedding === "string") {
          try {
            embedding = JSON.parse(embedding);
          } catch (e) {
            console.warn(`Failed to parse embedding for node ${node.name}:`, e);
            return; // このノードはスキップ
          }
        }

        // 配列でない場合はスキップ
        if (!Array.isArray(embedding)) {
          console.warn(
            `Invalid embedding format for node ${node.name}:`,
            typeof embedding,
          );
          return;
        }

        entityEmbeddings.set(node.name, embedding);
      }
    });

    relations.forEach((rel: any) => {
      if (rel.transEEmbedding) {
        // ベクトルデータの型チェックと変換
        let embedding = rel.transEEmbedding;

        // 文字列の場合はパースを試行
        if (typeof embedding === "string") {
          try {
            embedding = JSON.parse(embedding);
          } catch (e) {
            console.warn(
              `Failed to parse embedding for relation ${rel.type}:`,
              e,
            );
            return; // このリレーションはスキップ
          }
        }

        // 配列でない場合はスキップ
        if (!Array.isArray(embedding)) {
          console.warn(
            `Invalid embedding format for relation ${rel.type}:`,
            typeof embedding,
          );
          return;
        }

        // 同じtypeのリレーションが複数ある場合、最初のものを使用
        // （学習時は同じtypeのリレーションには同じ埋め込み表現が適用される）
        if (!relationEmbeddings.has(rel.type)) {
          relationEmbeddings.set(rel.type, embedding);
          console.log(`Added embedding for relation type: ${rel.type}`);
        }
      }
    });

    // デバッグ用ログ
    console.log(
      `Loaded ${entityEmbeddings.size} entity embeddings and ${relationEmbeddings.size} relation embeddings`,
    );

    // 埋め込み表現が不足している場合はエラー
    if (entityEmbeddings.size === 0 || relationEmbeddings.size === 0) {
      return new Response(
        JSON.stringify({
          error: "Insufficient embeddings",
          entityCount: entityEmbeddings.size,
          relationCount: relationEmbeddings.size,
        }),
        { status: 400 },
      );
    }

    const config = {
      dimensions: 50,
      learningRate: 0.01,
      margin: 1.0,
      epochs: 1000,
      batchSize: 128,
    };

    const predictor = new TransEPredictor(
      config,
      entityEmbeddings,
      relationEmbeddings,
    );

    // relationを予測（headとtailからrelationを予測）
    const predictedRelations = predictor.predictRelation(head, tail, 10);

    console.log(
      `Predicted ${predictedRelations.length} relations for head "${head}" and tail "${tail}":`,
      predictedRelations,
    );

    return new Response(JSON.stringify(predictedRelations), {
      headers: { "Content-Type": "application/json" },
    });
  },
);

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/trans-e-predict-relations-query-rpc' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"head":"entity1","tail":"entity2","topicSpaceId":"space1"}'

*/
