import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/env";
import { api } from "@/trpc/server";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { DocumentType } from "@prisma/client";
import {
  attachGraphProperties,
  fuseGraphs,
} from "@/app/_utils/kg/data-disambiguation";
import {
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { GraphChangeType } from "@prisma/client";
import { createCorsResponse, createCorsOptionsResponse } from "../cors";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return createCorsOptionsResponse(origin);
}

export async function POST(request: Request) {
  try {
    if (!env.QUICK_COMMONS_TOPICSPACE_ID || !env.QUICK_COMMONS_SYSTEM_USER_ID) {
      const response = NextResponse.json(
        { error: "Quick Commons API is not configured" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    const body = (await request.json()) as { text: string };
    const { text } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      const response = NextResponse.json(
        { error: "テキストが空です" },
        { status: 400 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    // 1. テキストをBlobに変換してSupabase Storageにアップロード
    const textBlob = new Blob([text], {
      type: "text/plain; charset=utf-8",
    });
    const fileUrl = await storageUtils.uploadFromBlob(
      textBlob,
      BUCKETS.PATH_TO_INPUT_TXT,
    );

    if (!fileUrl) {
      const response = NextResponse.json(
        { error: "ファイルのアップロードに失敗しました" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    // 2. 知識グラフを抽出（TRPCプロシージャを使用）
    const extractResult = await api.kg.extractKG({
      fileUrl,
      extractMode: "langChain",
      isPlaneTextMode: true,
    });

    if (!extractResult.data?.graph) {
      const response = NextResponse.json(
        { error: extractResult.data?.error ?? "グラフ抽出エラー" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    const graphDataForFrontend = extractResult.data.graph;

    // 3. SourceDocumentを作成
    const sourceDocument = await db.sourceDocument.create({
      data: {
        name: `episode_${Date.now()}`,
        url: fileUrl,
        documentType: DocumentType.INPUT_TXT,
        user: { connect: { id: env.QUICK_COMMONS_SYSTEM_USER_ID } },
      },
    });

    // 4. DocumentGraphを作成
    const documentGraph = await db.documentGraph.create({
      data: {
        user: { connect: { id: env.QUICK_COMMONS_SYSTEM_USER_ID } },
        sourceDocument: { connect: { id: sourceDocument.id } },
        dataJson: {},
      },
    });

    // 5. GraphNodeとGraphRelationshipを作成
    await db.graphNode.createMany({
      data: graphDataForFrontend.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        label: node.label,
        properties: node.properties ?? {},
        documentGraphId: documentGraph.id,
      })),
    });

    await db.graphRelationship.createMany({
      data: graphDataForFrontend.relationships.map((relationship) => ({
        id: relationship.id,
        fromNodeId: relationship.sourceId,
        toNodeId: relationship.targetId,
        type: relationship.type,
        properties: relationship.properties ?? {},
        documentGraphId: documentGraph.id,
      })),
    });

    // 6. Topicspaceを取得
    const topicSpace = await db.topicSpace.findFirst({
      where: {
        id: env.QUICK_COMMONS_TOPICSPACE_ID,
        isDeleted: false,
      },
      include: {
        graphNodes: {
          where: {
            deletedAt: null,
          },
        },
        graphRelationships: {
          where: {
            deletedAt: null,
          },
        },
        sourceDocuments: {
          include: { graph: true },
        },
      },
    });

    if (!topicSpace) {
      const response = NextResponse.json(
        { error: "Topicspace not found" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    // 7. SourceDocumentをTopicspaceに接続
    await db.topicSpace.update({
      where: { id: topicSpace.id },
      data: {
        sourceDocuments: {
          connect: { id: sourceDocument.id },
        },
      },
    });

    // 8. Topicspaceのグラフデータを更新
    const prevNodes = topicSpace.graphNodes;
    const prevRelationships = topicSpace.graphRelationships;

    const documentNodes = await db.graphNode.findMany({
      where: { documentGraphId: documentGraph.id },
    });
    const documentRelationships = await db.graphRelationship.findMany({
      where: { documentGraphId: documentGraph.id },
    });

    const fusedGraph = await fuseGraphs({
      sourceGraph: {
        nodes: prevNodes,
        relationships: prevRelationships,
      },
      targetGraph: {
        nodes: documentNodes.map((node) => ({
          ...node,
          documentGraphId: null,
          topicSpaceId: topicSpace.id,
        })),
        relationships: documentRelationships.map((r) => ({
          ...r,
          documentGraphId: null,
          topicSpaceId: topicSpace.id,
        })),
      },
      labelCheck: true,
    });

    const topicSpaceNodes = await db.graphNode.findMany({
      where: { topicSpaceId: topicSpace.id },
    });
    const topicSpaceRelationships = await db.graphRelationship.findMany({
      where: { topicSpaceId: topicSpace.id },
    });

    const newGraphWithProperties = attachGraphProperties(
      { nodes: fusedGraph.nodes, relationships: fusedGraph.relationships },
      { nodes: topicSpaceNodes, relationships: topicSpaceRelationships },
      true,
    );

    // ノードの差分から追加されたノードを作成
    const nodeDiffs = diffNodes(
      prevNodes.map((node) => formNodeDataForFrontend(node)),
      newGraphWithProperties.nodes.map((n) => formNodeDataForFrontend(n)),
    );
    const addedNodesData = nodeDiffs
      .filter((diff) => diff.type === GraphChangeType.ADD)
      .map((node) => ({
        id: node.updated?.id,
        name: node.updated?.name ?? "",
        label: node.updated?.label ?? "",
        properties: node.updated?.properties ?? {},
        topicSpaceId: topicSpace.id,
      }));
    await db.graphNode.createMany({
      data: addedNodesData,
    });

    // リレーションシップの差分から追加されたリレーションシップを作成
    const relationshipDiffs = diffRelationships(
      prevRelationships.map((r) => formRelationshipDataForFrontend(r)),
      newGraphWithProperties.relationships.map((r) =>
        formRelationshipDataForFrontend(r),
      ),
    );
    const addedRelationshipsData = relationshipDiffs
      .filter((diff) => diff.type === GraphChangeType.ADD)
      .map((relationship) => ({
        id: relationship.updated?.id,
        type: relationship.updated?.type ?? "",
        properties: relationship.updated?.properties ?? {},
        fromNodeId: relationship.updated?.sourceId ?? "",
        toNodeId: relationship.updated?.targetId ?? "",
        topicSpaceId: topicSpace.id,
      }));

    await db.graphRelationship.createMany({
      data: addedRelationshipsData,
    });

    const response = NextResponse.json({
      sourceDocumentId: sourceDocument.id,
      topicspaceId: topicSpace.id,
    });
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  } catch (error) {
    console.error("Error in create endpoint:", error);
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  }
}
