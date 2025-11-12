import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const imageRouter = createTRPCRouter({
  /**
   * 画像URLをプロキシしてbase64に変換して返す
   * CORSエラーを回避するためにサーバー側で画像をダウンロード
   */
  getBase64FromUrl: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
      }),
    )
    .query(async ({ input }) => {
      try {
        // サーバー側で画像をダウンロード
        const response = await fetch(input.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        const contentType = response.headers.get("content-type") ?? "image/jpeg";
        const dataUrl = `data:${contentType};base64,${base64}`;

        return { dataUrl };
      } catch (error) {
        console.error("Error fetching image:", error);
        throw new Error("Failed to fetch image");
      }
    }),
});

