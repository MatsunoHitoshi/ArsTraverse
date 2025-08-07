// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  env,
  pipeline,
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.5.0";
import { supabase } from "../_shared/pg-client.ts";

env.useBrowserCache = false;
env.allowLocalModels = false;

console.log("loading function...");

const pipe = await pipeline(
  "feature-extraction", // ベクトル化
  "Supabase/gte-small", // モデルの指定
);

Deno.serve(async (req) => {
  // 全件のノードを取得
  const { data: nodes, error: nodesError } = await supabase
    .from("GraphNode")
    .select("name, id")
    .is("nameEmbedding", null)
    .limit(50); // 埋め込みがまだ作成されていないノードのみ

  if (nodesError) {
    console.error(nodesError);
    return new Response(JSON.stringify({ error: nodesError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!nodes || nodes.length === 0) {
    return new Response(
      JSON.stringify({
        message: "No nodes found or all nodes already have embeddings",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const chunkSize = 50;
  const firstChunkNodes = nodes.slice(0, chunkSize);

  console.log(`Processing ${firstChunkNodes.length} nodes...`);

  const results = [];
  let processedCount = 0;

  // 各ノードの埋め込みを順次処理
  for (const node of firstChunkNodes) {
    try {
      console.log(
        `Processing node: ${node.name} (${processedCount + 1}/${nodes.length})`,
      );

      const output = await pipe(node.name, {
        pooling: "mean",
        normalize: true,
      });
      const embedding = Array.from(output.data);

      const { data: updatedNodeData, error: updateError } = await supabase
        .from("GraphNode")
        .update({
          nameEmbedding: embedding,
        })
        .eq("id", node.id);

      if (updateError) {
        console.error(`Error updating node ${node.id}:`, updateError);
        results.push({
          id: node.id,
          name: node.name,
          error: updateError.message,
        });
      } else {
        results.push({ id: node.id, name: node.name, success: true });
        processedCount++;
      }
    } catch (error) {
      console.error(`Error processing node ${node.id}:`, error);
      results.push({ id: node.id, name: node.name, error: error.message });
    }
  }

  return new Response(
    JSON.stringify({
      message: `Processed ${processedCount} out of ${nodes.length} nodes`,
      results,
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-node-name-embeddings' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
