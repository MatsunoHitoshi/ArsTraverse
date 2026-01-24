import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
import puppeteer from "puppeteer";
import { env } from "@/env";
import { PAGE_SIZE_TEMPLATES, convertUnit } from "@/app/_components/print-preview/types";

// PrintLayoutSettingsのZodスキーマ
const PageSizeTemplateSchema = z.enum(["A4", "A3", "A2", "A1", "A0", "B4", "B3", "B2", "B1"]);
const SizeUnitSchema = z.enum(["mm", "cm", "inch"]);
const PageOrientationSchema = z.enum(["portrait", "landscape"]);
const ColorModeSchema = z.enum(["color", "grayscale"]);
const MetaGraphDisplayModeSchema = z.enum(["none", "story", "all"]);
const TextOverlayDisplayModeSchema = z.enum(["none", "show"]);
const LayoutOrientationSchema = z.enum(["vertical", "horizontal"]);
const DetailedGraphDisplayModeSchema = z.enum(["all", "story"]);

const PageSizeSettingsSchema = z.object({
  mode: z.enum(["template", "custom"]),
  template: PageSizeTemplateSchema.optional(),
  customWidth: z.number().optional(),
  customHeight: z.number().optional(),
  unit: SizeUnitSchema.optional(),
  orientation: PageOrientationSchema.optional(),
});

const MarginSettingsSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

const FontSizeSettingsSchema = z.object({
  title: z.number(),
  body: z.number(),
  graph: z.number(),
});

const GraphSizeSettingsSchema = z.object({
  width: z.number(),
  height: z.number(),
  autoFit: z.boolean(),
});

const PrintLayoutSettingsSchema = z.object({
  pageSize: PageSizeSettingsSchema,
  margins: MarginSettingsSchema,
  fontSize: FontSizeSettingsSchema,
  graphSize: GraphSizeSettingsSchema,
  colorMode: ColorModeSchema,
  metaGraphDisplay: MetaGraphDisplayModeSchema,
  textOverlayDisplay: TextOverlayDisplayModeSchema.optional(),
  layoutOrientation: LayoutOrientationSchema.optional(),
  detailedGraphDisplay: DetailedGraphDisplayModeSchema.optional(),
  showEdgeLabels: z.boolean().optional(),
});

const GeneratePdfSchema = z.object({
  workspaceId: z.string(),
  layoutSettings: PrintLayoutSettingsSchema,
});

export const printRouter = createTRPCRouter({
  generatePdf: protectedProcedure
    .input(GeneratePdfSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, layoutSettings } = input;

      // ワークスペースへのアクセス権限を確認
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
      });

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found or access denied",
        });
      }

      // ベースURLを取得
      const baseUrl = env.NEXT_PUBLIC_BASE_URL || env.NEXTAUTH_URL || "http://localhost:3000";
      
      // 印刷専用ページのURLを構築
      const settingsParam = encodeURIComponent(JSON.stringify(layoutSettings));
      const printUrl = `${baseUrl}/workspaces/${workspaceId}/print-preview/print?settings=${settingsParam}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let browser: any = null;
      try {
        // Puppeteerでブラウザを起動
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        browser = await puppeteer.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
          ],
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const page = await browser.newPage();

        // ページサイズを設定
        const pageSizeInMm = getPageSizeInMm(layoutSettings);
        const pageWidthPx = pageSizeInMm.width * 3.779527559; // mm to px
        const pageHeightPx = pageSizeInMm.height * 3.779527559;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await page.setViewport({
          width: Math.round(pageWidthPx),
          height: Math.round(pageHeightPx),
        });

        // リクエストヘッダーからクッキーを取得して設定
        const cookieHeader = ctx.headers.get("cookie");
        if (cookieHeader) {
          // クッキー文字列をパースして設定
          const cookies = cookieHeader.split(";").map((cookie) => {
            const [name, ...valueParts] = cookie.trim().split("=");
            const value = valueParts.join("=");
            return { name: name ?? "", value: value ?? "" };
          }).filter((cookie) => cookie.name && cookie.value);

          const url = new URL(baseUrl);
          for (const cookie of cookies) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
              await page.setCookie({
                name: cookie.name,
                value: cookie.value,
                domain: url.hostname,
                path: "/",
              });
            } catch (error) {
              // クッキーの設定に失敗しても続行（一部のクッキーが無効な場合がある）
              console.warn(`Failed to set cookie ${cookie.name}:`, error);
            }
          }
        }

        // ページにアクセス
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await page.goto(printUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        // ページが完全にレンダリングされるまで待機
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 追加の待機時間

        // PDFを生成
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const pdf = await page.pdf({
          format: undefined, // カスタムサイズを使用
          width: `${pageSizeInMm.width}mm`,
          height: `${pageSizeInMm.height}mm`,
          margin: {
            top: `${layoutSettings.margins.top}mm`,
            right: `${layoutSettings.margins.right}mm`,
            bottom: `${layoutSettings.margins.bottom}mm`,
            left: `${layoutSettings.margins.left}mm`,
          },
          printBackground: true, // 背景を印刷
          preferCSSPageSize: true,
        });

        // PDFのBufferを返す（Puppeteerのpdf()は既にBufferを返す）
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return pdf;
      } catch (error) {
        console.error("PDF generation error:", error);
        
        // より詳細なエラーメッセージを提供
        let errorMessage = "PDF生成に失敗しました";
        if (error instanceof Error) {
          errorMessage = error.message;
          // Puppeteerのタイムアウトエラーの場合
          if (error.message.includes("timeout") || error.message.includes("Navigation timeout")) {
            errorMessage = "ページの読み込みがタイムアウトしました。しばらく待ってから再度お試しください。";
          }
          // ネットワークエラーの場合
          if (error.message.includes("net::ERR") || error.message.includes("Navigation failed")) {
            errorMessage = "ページにアクセスできませんでした。認証情報を確認してください。";
          }
        }
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: errorMessage,
          cause: error,
        });
      } finally {
        if (browser) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await browser.close();
          } catch (closeError) {
            console.error("Failed to close browser:", closeError);
          }
        }
      }
    }),
});

// ページサイズをmm単位で取得するヘルパー関数
function getPageSizeInMm(layoutSettings: z.infer<typeof PrintLayoutSettingsSchema>) {
  if (layoutSettings.pageSize.mode === "template" && layoutSettings.pageSize.template) {
    const template = PAGE_SIZE_TEMPLATES[layoutSettings.pageSize.template];
    const isLandscape = layoutSettings.pageSize.orientation === "landscape";
    return {
      width: isLandscape ? template.height : template.width,
      height: isLandscape ? template.width : template.height,
    };
  } else {
    const unit = layoutSettings.pageSize.unit ?? "mm";
    const width = layoutSettings.pageSize.customWidth ?? 1116;
    const height = layoutSettings.pageSize.customHeight ?? 800;
    return {
      width: convertUnit(width, unit, "mm"),
      height: convertUnit(height, unit, "mm"),
    };
  }
}
