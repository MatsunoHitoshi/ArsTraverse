import type { GraphDocumentForFrontend } from "@/app/const/types";
import { api } from "@/trpc/server";
import { NextResponse } from "next/server";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ node_id: string; id: string }> },
) => {
  try {
    const { id, node_id } = await params;
    const res = await api.topicSpaces.getByIdPublic({
      id,
      // filterOption: { type: "tag", value: "main", cutOff: "1" },
    });

    const graphData = res.graphData as GraphDocumentForFrontend;

    const tagFilteredNodes = graphData.nodes.filter((node) => {
      if (node.properties.tag) {
        return node.properties.tag.toLowerCase() === "main";
      } else {
        return false;
      }
    });

    const sourceNode = tagFilteredNodes.find((node) => node.id === node_id) ?? {
      id: parseInt(node_id),
      name: "",
      label: "",
      properties: {},
    };
    const sourceLinks = graphData.relationships.filter(
      (link) => link.sourceId === node_id || link.targetId === node_id,
    );
    const neighborNodes = tagFilteredNodes.filter((node) =>
      sourceLinks?.some(
        (l) => l.sourceId === node.id || l.targetId === node.id,
      ),
    );
    const neighborNodesIds = neighborNodes.map((node) => node.id);
    const neighborLinks = graphData.relationships.filter(
      (l) =>
        neighborNodesIds.some((id) => l.sourceId === id) &&
        neighborNodesIds.some((id) => l.targetId === id),
    );

    return NextResponse.json({
      id: res.id,
      graphData: {
        nodes: neighborNodes.length !== 0 ? neighborNodes : [sourceNode],
        relationships: neighborLinks,
      },
    });
  } catch (error) {
    throw error;
  }
};
