import { storageUtils } from "@/app/_utils/supabase/supabase";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { BUCKETS } from "@/app/_utils/supabase/const";
import type { PrismaClient } from "@prisma/client";
import { writeLocalFileFromUrl } from "@/app/_utils/sys/file";
import { dataDisambiguation } from "@/app/_utils/kg/data-disambiguation";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import type { Extractor } from "@/server/lib/extractors/base";
import { AssistantsApiExtractor } from "@/server/lib/extractors/assistants";
import { LangChainExtractor } from "@/server/lib/extractors/langchain";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import { completeTranslateProperties } from "@/app/_utils/kg/node-name-translation";

export class AnnotationGraphExtractor {
  constructor(private db: PrismaClient) {}

  /**
   * 注釈のテキストから知識グラフを抽出
   */
  async extractGraphFromAnnotation(
    annotationId: string,
    extractMode = "langChain",
  ): Promise<{
    graphDocument: GraphDocumentForFrontend;
    text: string;
    url: string;
  }> {
    const annotation = await this.db.annotation.findUnique({
      where: { id: annotationId },
    });

    if (!annotation?.content) {
      throw new Error("注釈が見つからないか、内容が空です");
    }

    // 注釈の内容をテキストに変換
    const textContent = convertJsonToText(annotation.content);

    try {
      // テキストをBlobに変換してSupabaseにアップロード
      const textBlob = new Blob([textContent], {
        type: "text/plain; charset=utf-8",
      });

      const fileUrl = await storageUtils.uploadFromBlob(
        textBlob,
        BUCKETS.PATH_TO_INPUT_TXT,
      );

      if (!fileUrl) {
        throw new Error("ファイルのアップロードに失敗しました");
      }

      // kg.tsのextractKGと同様の処理を実行
      const localFilePath = await writeLocalFileFromUrl(
        fileUrl,
        `annotation_${annotationId}.txt`,
      );

      // スキーマ設定（美術領域に特化）
      // const schema = {
      //   allowedNodes: [
      //     "Artist",
      //     "Artwork",
      //     "Museum",
      //     "Exhibition",
      //     "Curator",
      //     "Critic",
      //     "Movement",
      //     "Technique",
      //     "Material",
      //     "Location",
      //     "Concept",
      //     "Influence",
      //     "Period",
      //     "Style",
      //   ],
      //   allowedRelationships: [
      //     "created",
      //     "influenced_by",
      //     "exhibited_at",
      //     "curated_by",
      //     "criticized_by",
      //     "belongs_to",
      //     "uses",
      //     "located_in",
      //     "inspired_by",
      //     "represents",
      //     "part_of",
      //     "related_to",
      //   ],
      // };
      const schema = {
        allowedNodes: [],
        allowedRelationships: [],
      };

      // エクストラクターを選択
      const extractor: Extractor =
        extractMode === "langChain"
          ? new LangChainExtractor()
          : new AssistantsApiExtractor();

      // グラフ抽出を実行
      const nodesAndRelationships = await extractor.extract(
        localFilePath,
        true, // isPlaneTextMode
        schema,
      );

      if (!nodesAndRelationships) {
        throw new Error("グラフ抽出に失敗しました");
      }

      // データを正規化
      const normalizedNodesAndRelationships = {
        ...nodesAndRelationships,
        nodes: nodesAndRelationships.nodes.map((n) => ({
          id: n.id,
          name: n.name,
          label: n.label,
          properties: n.properties ?? {},
          documentGraphId: null,
          topicSpaceId: null,
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
        })),
        relationships: nodesAndRelationships.relationships.map((r) => ({
          id: r.id,
          type: r.type,
          properties: r.properties ?? {},
          fromNodeId: r.sourceId,
          toNodeId: r.targetId,
          documentGraphId: null,
          topicSpaceId: null,
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
        })),
      };

      // データの曖昧性解消
      const disambiguatedNodesAndRelationships = dataDisambiguation(
        normalizedNodesAndRelationships,
      );
      const translatedGraphDocument = await completeTranslateProperties(
        disambiguatedNodesAndRelationships,
      );

      // フロントエンド用の形式に変換
      const graphDocument = formGraphDataForFrontend(
        disambiguatedNodesAndRelationships,
      );

      return {
        graphDocument,
        text: textContent,
        url: fileUrl,
      };
    } catch (error) {
      console.error("グラフ抽出中にエラーが発生しました:", error);
      throw new Error(`グラフ抽出エラー: ${String(error)}`);
    }
  }
}
