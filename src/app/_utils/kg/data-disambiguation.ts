import { createId } from "@/app/_utils/cuid/cuid";
import type { NodeTypeForFrontend } from "@/app/const/types";
import type { GraphNode, GraphRelationship } from "@prisma/client";

const deleteDuplicatedRelationships = (relationships: GraphRelationship[]) => {
  const filteredRelationships = relationships.filter((relationship, index) => {
    return (
      index ===
      relationships.findIndex(
        (r) =>
          r.fromNodeId === relationship.fromNodeId &&
          r.toNodeId === relationship.toNodeId &&
          r.type === relationship.type,
      )
    );
  });
  const mergedRelationships = filteredRelationships.map((relationship) => ({
    ...relationship,
    id: createId(),
  }));
  return mergedRelationships;
};

export const mergerNodes = (
  graph: { nodes: GraphNode[]; relationships: GraphRelationship[] },
  mergeNodes: NodeTypeForFrontend[],
) => {
  const margeTargetNode = mergeNodes[0];
  const margeSourceNodes = mergeNodes.slice(1);

  if (!margeTargetNode) {
    throw new Error("Target node is not found");
  }

  const newRelationships = graph.relationships
    .map((sRelationship) => {
      if (
        margeSourceNodes.some((mNode) => mNode.id === sRelationship.toNodeId) &&
        margeSourceNodes.some((mNode) => mNode.id === sRelationship.fromNodeId)
      ) {
        return undefined;
      } else if (
        margeSourceNodes.some((mNode) => mNode.id === sRelationship.toNodeId)
      ) {
        return {
          ...sRelationship,
          toNodeId: margeTargetNode.id,
        };
      } else if (
        margeSourceNodes.some((mNode) => mNode.id === sRelationship.fromNodeId)
      ) {
        return {
          ...sRelationship,
          fromNodeId: margeTargetNode.id,
        };
      } else {
        return sRelationship;
      }
    })
    .filter((r): r is GraphRelationship => !!r);

  const newNodes = graph.nodes.filter((node) => {
    return !margeSourceNodes.some(
      (mNode) =>
        mNode.id === node.id &&
        mNode.label === node.label &&
        mNode.name === node.name,
    );
  });

  // const disambiguatedGraph = dataDisambiguation({
  //   nodes: newNodes,
  //   relationships: newRelationships,
  // });
  // return disambiguatedGraph;

  return { nodes: newNodes, relationships: newRelationships };
};

const mergerGraphsWithDuplicatedNodeName = (p: {
  sourceGraph: { nodes: GraphNode[]; relationships: GraphRelationship[] }; //大元のグラフ
  targetGraph: { nodes: GraphNode[]; relationships: GraphRelationship[] }; //追加するグラフ
  labelCheck: boolean;
}) => {
  const { targetGraph, sourceGraph, labelCheck } = p;
  const duplicatedTargetNodes = targetGraph.nodes.filter((sourceNode) => {
    return sourceGraph.nodes.some((targetNode) => {
      return (
        targetNode.name === sourceNode.name &&
        (labelCheck ? targetNode.label === sourceNode.label : true)
      );
    });
  });
  const additionalNodes = targetGraph.nodes.filter((sourceNode) => {
    return !sourceGraph.nodes.some((targetNode) => {
      return (
        targetNode.name === sourceNode.name &&
        (labelCheck ? targetNode.label === sourceNode.label : true)
      );
    });
  });

  const newNodes = [...sourceGraph.nodes];
  const newRelationships = [...sourceGraph.relationships];
  const nodeIdRecords: { prevId: string; newId: string }[] = [];

  duplicatedTargetNodes.map((dNode) => {
    const prevId = dNode.id;
    const newId = newNodes.find((nn) => {
      return (
        nn.name === dNode.name && (labelCheck ? nn.label === dNode.label : true)
      );
    })?.id;
    if (newId) {
      nodeIdRecords.push({ prevId: prevId, newId: newId });
    }
  });

  additionalNodes.map((additionalNode) => {
    const prevId = additionalNode.id;
    const newId = createId();
    nodeIdRecords.push({ prevId: prevId, newId: newId });
    newNodes.push({ ...additionalNode, id: newId });
  });

  targetGraph.relationships.map((tRelationship) => {
    const newSourceId = nodeIdRecords.find(
      (rec) => rec.prevId === tRelationship.fromNodeId,
    )?.newId;
    const newTargetId = nodeIdRecords.find(
      (rec) => rec.prevId === tRelationship.toNodeId,
    )?.newId;

    const newId = createId();
    if (newSourceId && newTargetId) {
      newRelationships.push({
        ...tRelationship,
        id: newId,
        fromNodeId: newSourceId,
        toNodeId: newTargetId,
      });
    }
  });

  return { nodes: newNodes, relationships: newRelationships };
};

const simpleMerge = (graph: {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}) => {
  const { nodes, relationships } = graph;

  // 1. Identify unique nodes and build ID mapping
  const uniqueNodes: GraphNode[] = [];
  const idMapping = new Map<string, string>(); // oldId -> newId (kept Id)

  nodes.forEach((node) => {
    // Find if we already have a node with same name/label
    const existingNode = uniqueNodes.find(
      (n) => n.name === node.name && n.label === node.label,
    );

    if (existingNode) {
      // Map this node's ID to the existing node's ID
      idMapping.set(node.id, existingNode.id);
    } else {
      // Keep this node
      uniqueNodes.push(node);
      idMapping.set(node.id, node.id);
    }
  });

  // 2. Remap relationships
  const remappedRelationships = relationships.map((rel) => {
    const newFromId = idMapping.get(rel.fromNodeId);
    const newToId = idMapping.get(rel.toNodeId);

    if (!newFromId || !newToId) {
      // If a relationship refers to a node that is not in the node list, keep it as is.
      // This might happen if the node list is incomplete, but in that case the relationship is already invalid.
      // We'll keep the original IDs to avoid introducing undefined, but these will likely be dangling.
      return {
        ...rel,
        fromNodeId: newFromId ?? rel.fromNodeId,
        toNodeId: newToId ?? rel.toNodeId,
      };
    }

    return {
      ...rel,
      fromNodeId: newFromId,
      toNodeId: newToId,
    };
  });

  // 3. Deduplicate relationships
  const mergedRelationships = deleteDuplicatedRelationships(
    remappedRelationships,
  );

  return { nodes: uniqueNodes, relationships: mergedRelationships };
};

export const dataDisambiguation = (graph: {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}) => {
  const disambiguatedGraph = simpleMerge(graph);
  return disambiguatedGraph;
};

export const attachGraphProperties = (
  newGraph: { nodes: GraphNode[]; relationships: GraphRelationship[] },
  prevGraph: { nodes: GraphNode[]; relationships: GraphRelationship[] },
  labelCheck: boolean,
) => {
  const newNodesWithProperties = newGraph.nodes.map((nn) => {
    const matchedPrevNode = prevGraph.nodes.find((pn) => {
      return pn.name === nn.name && (labelCheck ? pn.label === nn.label : true);
    });
    if (!!matchedPrevNode && !!matchedPrevNode.properties) {
      return { ...nn, properties: matchedPrevNode.properties };
    } else {
      return nn;
    }
  });
  const newRelationshipsWithProperties = newGraph.relationships.map((nr) => {
    const matchedPrevRelationship = prevGraph.relationships.find((pr) => {
      return pr.type === nr.type;
    });
    if (!!matchedPrevRelationship && !!matchedPrevRelationship.properties) {
      return { ...nr, properties: matchedPrevRelationship.properties };
    } else {
      return nr;
    }
  });

  return {
    nodes: newNodesWithProperties,
    relationships: newRelationshipsWithProperties,
  };
};

export const fuseGraphs = async (p: {
  sourceGraph: { nodes: GraphNode[]; relationships: GraphRelationship[] }; //大元のグラフ
  targetGraph: { nodes: GraphNode[]; relationships: GraphRelationship[] }; //追加するグラフ
  labelCheck: boolean;
}) => {
  const graph = mergerGraphsWithDuplicatedNodeName(p);
  return graph;
};
