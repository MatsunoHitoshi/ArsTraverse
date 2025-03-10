import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import type {
  NodeType,
  RelationshipType,
} from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import OpenAI from "openai";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";

const GenerateGraphSummarySchema = z.object({
  graphData: z.object({
    nodes: z.array(z.any()),
    relationships: z.array(z.any()),
  }),
  startId: z.string(),
  endId: z.string(),
});

const TextToSpeechSchema = z.object({
  text: z.string(),
});

export const assistantRouter = createTRPCRouter({
  graphSummary: protectedProcedure
    .input(GenerateGraphSummarySchema)
    .mutation(async function* ({ ctx, input }) {
      const sanitizedGraphData = {
        nodes: input.graphData.nodes as NodeType[],
        relationships: input.graphData.relationships as RelationshipType[],
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
          "あなたは美術について紹介する記事を執筆する専門家です。必ず与えられた文脈からわかる情報のみを使用して回答を生成してください。",
        model: "gpt-4o-mini",
        temperature: 1.0,
      });
      const thread = await openai.beta.threads.create({
        messages: [
          {
            role: "user",
            content: `「${startNode?.name}」と「${endNode?.name}」の関係について紹介する文章を執筆しようとしています。下記の文脈を使って簡易的な下書きを作成してください。\n${context}`,
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
    .mutation(async function* ({ ctx, input }) {
      const sanitizedGraphData = {
        nodes: input.graphData.nodes as NodeType[],
        relationships: input.graphData.relationships as RelationshipType[],
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
        model: "gpt-4o-mini",
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
    .mutation(async ({ ctx, input }) => {
      const openai = new OpenAI();

      try {
        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: input.text,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        const blob = new Blob([buffer], { type: "audio/mpeg" });
        const fileUrl = await storageUtils.uploadFromBlob(
          blob,
          BUCKETS.PATH_TO_SPEECH_AUDIO_FILE,
        );
        return {
          url: fileUrl,
        };
      } catch (error) {
        console.log("error: ", error);
        return {
          error: "音声を生成できませんでした",
        };
      }
    }),
});
