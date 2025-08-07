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

Deno.serve(
  async (req: { json: () => PromiseLike<{ query: any }> | { query: any } }) => {
    const { query } = await req.json();
    const output = await pipe(query, {
      pooling: "mean",
      normalize: true,
    });
    const embedding = Array.from(output.data); // クエリーをベクトル化する

    console.log("embedding", embedding);

    // RPCでストアード・ファンクションを呼び出す。
    const { data: nodes, error } = await supabase.rpc("name-vector-search", {
      query_embedding: embedding,
      match_threshold: 0.0, // 閾値
      match_count: 10, // 検索結果数
    });

    console.log("nodes", nodes);
    console.log("error", error);

    return new Response(JSON.stringify(nodes), {
      headers: { "Content-Type": "application/json" },
    });
  },
);
/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-node-name-embeddings' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
