import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import OpenAI from "openai";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { computeTextHash } from "@/app/_utils/tts/text-hash";
import { KnowledgeGraphInputSchema } from "../schemas/knowledge-graph";

const GenerateGraphSummarySchema = z.object({
  graphData: KnowledgeGraphInputSchema,
  startId: z.string(),
  endId: z.string(),
});

const TextToSpeechSchema = z.object({
  text: z.string(),
  speed: z.number().min(0.25).max(4.0).default(1.15),
});

export const assistantRouter = createTRPCRouter({
  graphSummary: protectedProcedure
    .input(GenerateGraphSummarySchema)
    .mutation(async function* ({ input }) {
      const sanitizedGraphData = {
        nodes: input.graphData.nodes as NodeTypeForFrontend[],
        relationships: input.graphData
          .relationships as RelationshipTypeForFrontend[],
      };

      const openai = new OpenAI();
      let context = "";
      const nodes = sanitizedGraphData.nodes;
      sanitizedGraphData.relationships.forEach((edge) => {
        context += `(${
          nodes.find((n) => {
            return n?.id === edge?.sourceId;
          })?.name
        })-[${edge?.type}]->(${
          nodes.find((n) => {
            return n?.id === edge?.targetId;
          })?.name
        }) \n`;
      });

      const startNode = nodes.find((n) => {
        return String(n.id) === input.startId;
      });
      const endNode = nodes.find((n) => {
        return String(n.id) === input.endId;
      });

      console.log("keyword1: ", startNode?.name);
      console.log("keyword2: ", endNode?.name);
      console.log("context: \n", context);

      const assistant = await openai.beta.assistants.create({
        name: "記事執筆アシスタント",
        instructions:
          "あなたは美術について紹介する記事を執筆する専門家です。必ず与えられた文脈からわかる情報を使用して回答を生成してください。",
        model: "gpt-4.1-nano",
        temperature: 1.0,
      });
      const thread = await openai.beta.threads.create({
        messages: [
          {
            role: "user",
            content: `「${startNode?.name}」と「${endNode?.name}」の関係について紹介する文章を執筆しようとしています。下記の文脈を使用して簡単な解説を作成してください。\n${context}`,
          },
        ],
      });

      try {
        const stream = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: assistant.id,
          stream: true,
        });
        for await (const event of stream) {
          if (event.event === "thread.message.delta") {
            const chunk = event.data.delta.content?.[0];
            if (chunk && chunk.type === "text") {
              yield {
                summary: chunk.text?.value,
              };
            }
          }
        }

        // const mp3 = await openai.audio.speech.create({
        //   model: "tts-1",
        //   voice: "alloy",
        //   input: summary,
        // });
        // const buffer = Buffer.from(await mp3.arrayBuffer());
        // yield {
        //   summary: summary,
        //   speechBuffer: buffer,
        // };
      } catch (error) {
        console.log("error: ", error);
        return {
          summary: "",
          error: "解説を作成できませんでした",
        };
      }
    }),

  graphOutline: protectedProcedure
    .input(GenerateGraphSummarySchema)
    .mutation(async function* ({ input }) {
      const sanitizedGraphData = {
        nodes: input.graphData.nodes as NodeTypeForFrontend[],
        relationships: input.graphData
          .relationships as RelationshipTypeForFrontend[],
      };

      const openai = new OpenAI();
      let context = "";
      const nodes = sanitizedGraphData.nodes;
      sanitizedGraphData.relationships.forEach((edge) => {
        context += `(${
          nodes.find((n) => {
            return n?.id === edge?.sourceId;
          })?.name
        })-[${edge?.type}]->(${
          nodes.find((n) => {
            return n?.id === edge?.targetId;
          })?.name
        }) \n`;
      });

      const startNode = nodes.find((n) => {
        return String(n.id) === input.startId;
      });
      const endNode = nodes.find((n) => {
        return String(n.id) === input.endId;
      });

      const assistant = await openai.beta.assistants.create({
        name: "記事執筆アシスタント",
        instructions:
          "あなたは美術について紹介する記事を執筆する専門家です。必ず与えられた文脈からわかる情報のみを使用して回答を生成してください。",
        model: "gpt-4.1-nano",
        temperature: 1.0,
      });
      const thread = await openai.beta.threads.create({
        messages: [
          {
            role: "user",
            content: `「${startNode?.name}」と「${endNode?.name}」の関係について紹介する文章を執筆しようとしています。下記の文脈を使ってアウトラインを作成してください。回答にはアウトラインの内容のみを記載してください。\n${context}`,
          },
        ],
      });

      try {
        const stream = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: assistant.id,
          stream: true,
        });
        for await (const event of stream) {
          if (event.event === "thread.message.delta") {
            const chunk = event.data.delta.content?.[0];
            if (chunk && chunk.type === "text") {
              yield {
                summary: chunk.text?.value,
              };
            }
          }
        }
      } catch (error) {
        console.log("error: ", error);
        return {
          summary: "",
          error: "アウトラインを作成できませんでした",
        };
      }
    }),

  textToSpeech: protectedProcedure
    .input(TextToSpeechSchema)
    .mutation(async ({ input }) => {
      const trimmed = input.text.trim();
      if (!trimmed) {
        return { error: "音声を生成するテキストが empty です" };
      }

      const bucket = BUCKETS.PATH_TO_SPEECH_AUDIO_FILE;
      const textHash = computeTextHash(input.text);
      const ttsModel = "gpt-4o-mini-tts";
      const speed = input.speed ?? 1;
      const path = `${textHash}-${ttsModel}-s${speed}.mp3`;

      try {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Supabase Storage API の戻り型が error を含む union のため偽陽性 */
        let cachedExists = false;
        try {
          cachedExists = await storageUtils.exists(bucket, path);
        } catch (existsErr) {
          console.warn(
            "[textToSpeech] cache exists check failed, proceeding to generate:",
            existsErr instanceof Error ? existsErr.message : String(existsErr),
          );
        }

        if (cachedExists) {
          const url = storageUtils.getPublicUrl(bucket, path);
          return { url };
        }

        const openai = new OpenAI();
        let mp3;
        try {
          mp3 = await openai.audio.speech.create({
            model: ttsModel,
            voice: "nova",
            input: trimmed,
            speed,
            instructions:
              "自然な日本語で、流暢に読み上げてください。専門用語や固有名詞は適切な読み方で発音してください。アルファベットやローマ字の部分も日本語の文脈に合わせて、日本語風の発音で読み上げてください。英語の発音に切り替えないでください。「Studio HAUSU」は「スタジオ ハースー」と発音してください。",
          });
        } catch (openaiErr) {
          console.error(
            "[textToSpeech] OpenAI TTS failed:",
            openaiErr instanceof Error ? openaiErr : openaiErr,
          );
          throw openaiErr;
        }

        const buffer = Buffer.from(await mp3.arrayBuffer());
        const blob = new Blob([buffer], { type: "audio/mpeg" });

        try {
          const fileUrl = await storageUtils.uploadWithPath(blob, bucket, path);
          return { url: fileUrl };
        } catch (uploadErr) {
          console.error(
            "[textToSpeech] Supabase Storage upload failed:",
            uploadErr instanceof Error ? uploadErr : uploadErr,
          );
          throw uploadErr;
        }
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        console.error("[textToSpeech] error:", errMessage, errStack ?? "");

        const errorDetail =
          process.env.NODE_ENV === "development" ? errMessage : undefined;
        return {
          error: "音声を生成できませんでした",
          ...(errorDetail && { errorDetail }),
        };
      }
    }),
});
