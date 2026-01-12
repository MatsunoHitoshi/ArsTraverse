import type { GraphChangeType, Prisma } from "@prisma/client";
import { createId } from "../cuid/cuid";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export type PropertyTypeForFrontend = {
  [K in string]: string;
};

const itemSanitize = (item: string) => {
  return item.replace(/["\[\]{} ]/g, "");
};

const extractProperties = (list: string[]) => {
  const properties: Prisma.JsonValue = {};
  list.map((item) => {
    const keyValue = itemSanitize(item);
    const res = keyValue.split(":");
    const key = res[0];
    const val = res[1];
    if (key) {
      properties[key] = val ?? "";
    }
  });
  return properties;
};

export type NodeDiffType = {
  type: GraphChangeType;
  original: NodeTypeForFrontend | null;
  updated: NodeTypeForFrontend | null;
};

export type RelationshipDiffType = {
  type: GraphChangeType;
  original: RelationshipTypeForFrontend | null;
  updated: RelationshipTypeForFrontend | null;
};

type NodeJson = {
  name: string;
  label: string;
  properties: Prisma.JsonValue;
};

export const createExtraNode = (
  targetName: string,
  targetLabel: string,
  nodesJson: NodeJson[] | undefined,
): NodeTypeForFrontend => {
  const newNode: NodeTypeForFrontend = {
    id: createId(),
    name: targetName,
    label: targetLabel,
    properties: {},
  };
  if (nodesJson) {
    nodesJson?.push(newNode);
    return newNode;
  } else {
    return newNode;
  }
};

export const getNodesAndRelationshipsFromResult = (result: string) => {
  const regex = /Nodes:\s+(.*?)\s?\s?Relationships:\s?\s?(.*)/;
  const internalRegex = /\[(.*?)\]/;
  const clearBreakResult = result.replace(/\n/g, "");

  const parsing = clearBreakResult.match(regex);
  if (!parsing?.[1] || !parsing?.[2]) {
    return null;
  }
  const rawNodes: string = parsing[1];
  const rawRelationships: string = parsing[2];

  const nodes = rawNodes
    .match(new RegExp(internalRegex, "g"))
    ?.map((node) => node.split(","));
  const relationships = rawRelationships
    .match(new RegExp(internalRegex, "g"))
    ?.map((relationship) => relationship.split(","));

  console.log("nodes: ", nodes);
  console.log("relationships: ", relationships);

  const nodesJson = nodes?.map((node, index) => {
    const properties = extractProperties(node.slice(2));
    return {
      id: index,
      name: itemSanitize(node[0] ?? ""),
      label: itemSanitize(node[1] ?? ""),
      properties: properties,
    };
  });

  const relationshipsJson = relationships?.map((relationship, index) => {
    const properties = extractProperties(relationship.slice(3));

    const sourceName = itemSanitize(relationship[0] ?? "");
    const source =
      nodesJson?.find((node) => {
        return node.name === sourceName;
      }) ?? createExtraNode(sourceName, "ExtraNode", nodesJson);

    const targetName = itemSanitize(relationship[2] ?? "");
    const target =
      nodesJson?.find((node) => {
        return targetName === node.name;
      }) ?? createExtraNode(targetName, "ExtraNode", nodesJson);

    return {
      id: index,
      sourceId: source.id,
      type: itemSanitize(relationship[1] ?? ""),
      targetId: target.id,
      properties: properties,
    };
  });

  console.log("nodesJson: ", nodesJson);
  console.log("relationshipsJson: ", relationshipsJson);

  return {
    nodes: nodesJson ?? [],
    relationships: relationshipsJson ?? [],
  };
};
