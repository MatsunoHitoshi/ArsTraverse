"use client";

import React, { useState, useEffect, useMemo } from "react";
import { GraphChangeType, GraphChangeEntityType } from "@prisma/client";
import { api } from "@/trpc/react";

interface Node {
  id: string;
  name?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Edge {
  id: string;
  type?: string;
  sourceId: string;
  targetId: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Change {
  id: string;
  proposalId: string;
  changeType: GraphChangeType;
  changeEntityType: GraphChangeEntityType;
  changeEntityId: string;
  previousState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  createdAt: Date;
}

interface VisualDiffViewerProps {
  changes: Change[];
}

export const VisualDiffViewer: React.FC<VisualDiffViewerProps> = ({
  changes,
}) => {
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);
  const [nodeCache, setNodeCache] = useState<Record<string, Node>>({});
  const [expandedChangeId, setExpandedChangeId] = useState<string | null>(null);

  // エッジから必要なノードIDを収集（既存ノード + 新規ノード + 削除ノード）
  const nodeIds = new Set<string>();
  const newNodeCache = useMemo(() => {
    const cache = new Map<string, Node>();
    changes.forEach((change) => {
      if (change.changeEntityType === GraphChangeEntityType.NODE) {
        // 新規追加されるノードの情報をキャッシュ
        if (change.changeType === GraphChangeType.ADD) {
          const newNode = change.nextState as Node;
          cache.set(newNode.id, newNode);
        }
      }
    });
    return cache;
  }, [changes]);

  const removedNodeCache = useMemo(() => {
    const cache = new Map<string, Node>();
    changes.forEach((change) => {
      if (change.changeEntityType === GraphChangeEntityType.NODE) {
        // 削除されるノードの情報をキャッシュ
        if (change.changeType === GraphChangeType.REMOVE) {
          const removedNode = change.previousState as Node;
          cache.set(removedNode.id, removedNode);
        }
      }
    });
    return cache;
  }, [changes]);

  changes.forEach((change) => {
    if (change.changeEntityType === GraphChangeEntityType.EDGE) {
      const edge = change.nextState as Edge;
      const prevEdge = change.previousState as Edge;
      if (edge.sourceId) nodeIds.add(edge.sourceId);
      if (edge.targetId) nodeIds.add(edge.targetId);
      if (prevEdge.sourceId) nodeIds.add(prevEdge.sourceId);
      if (prevEdge.targetId) nodeIds.add(prevEdge.targetId);
    }
  });

  // ノード情報を取得
  const { data: nodes } = api.kg.getNodesByIds.useQuery(
    {
      nodeIds: Array.from(nodeIds),
    },
    {
      enabled: nodeIds.size > 0,
    },
  );

  // ノードキャッシュを更新（既存ノード + 新規ノード + 削除ノード）
  useEffect(() => {
    const cache: Record<string, Node> = {};

    // 既存ノードを追加
    if (nodes) {
      nodes.forEach((node) => {
        cache[node.id] = node as Node;
      });
    }

    // 新規ノードを追加
    newNodeCache.forEach((node, id) => {
      cache[id] = node;
    });

    // 削除ノードを追加
    removedNodeCache.forEach((node, id) => {
      cache[id] = node;
    });

    setNodeCache(cache);
  }, [nodes, newNodeCache, removedNodeCache]);

  if (changes.length === 0) {
    return <div className="text-sm text-gray-500">変更内容がありません</div>;
  }

  const renderNode = (
    node: Node,
    isNew: boolean,
    isRemoved: boolean,
    changeId: string,
  ) => {
    const nodeColor = isNew
      ? "bg-green-500"
      : isRemoved
        ? "bg-red-500"
        : "bg-blue-500";
    const borderColor = isNew
      ? "border-green-300"
      : isRemoved
        ? "border-red-300"
        : "border-blue-300";

    return (
      <div className="flex flex-col items-center gap-2">
        <div
          key={node.id}
          className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full ${nodeColor} border-2 ${borderColor} cursor-pointer transition-all hover:scale-110`}
          onClick={() => {
            if (expandedChangeId === changeId) {
              setExpandedChangeId(null);
            } else {
              setExpandedChangeId(changeId);
            }
          }}
          onMouseEnter={() => setHoveredNode(node)}
          onMouseLeave={() => setHoveredNode(null)}
        >
          {isNew && (
            <div className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-green-300">
              <span className="text-xs text-green-800">+</span>
            </div>
          )}
          {isRemoved && (
            <div className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-300">
              <span className="text-xs text-red-800">-</span>
            </div>
          )}
        </div>
        <span className="text-xs font-medium text-white">
          {node.name ?? node.id.slice(0, 2)}
        </span>
      </div>
    );
  };

  const renderEdgeWithNodes = (
    edge: Edge,
    isNew: boolean,
    isRemoved: boolean,
    changeId: string,
  ) => {
    const edgeColor = isNew
      ? "text-green-500"
      : isRemoved
        ? "text-red-500"
        : "text-blue-500";
    const lineColor = isNew
      ? "border-green-500"
      : isRemoved
        ? "border-red-500"
        : "border-blue-500";

    const sourceNode = nodeCache[edge.sourceId];
    const targetNode = nodeCache[edge.targetId];

    // ノードが新規追加かどうかを判定
    const isSourceNodeNew = sourceNode && newNodeCache.has(sourceNode.id);
    const isTargetNodeNew = targetNode && newNodeCache.has(targetNode.id);

    // ノードが削除されるかどうかを判定
    const isSourceNodeRemoved =
      sourceNode && removedNodeCache.has(sourceNode.id);
    const isTargetNodeRemoved =
      targetNode && removedNodeCache.has(targetNode.id);

    return (
      <div
        key={edge.id}
        className={`relative flex items-center justify-center ${edgeColor} cursor-pointer transition-all hover:scale-105`}
        onClick={() => {
          if (expandedChangeId === changeId) {
            setExpandedChangeId(null);
          } else {
            setExpandedChangeId(changeId);
          }
        }}
        onMouseEnter={() => setHoveredEdge(edge)}
        onMouseLeave={() => setHoveredEdge(null)}
      >
        {/* ソースノード */}
        {sourceNode && (
          <div className="flex flex-col items-end gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                isSourceNodeNew
                  ? "border-green-300 bg-green-500"
                  : isSourceNodeRemoved
                    ? "border-red-300 bg-red-500"
                    : "border-gray-400 bg-gray-600"
              }`}
            ></div>
            <span className="text-xs font-medium text-white">
              {sourceNode.name ?? sourceNode.id.slice(0, 2)}
            </span>
          </div>
        )}

        {/* エッジ線 */}
        <div className={`${lineColor} relative -mt-10 border-b-2`}>
          <div className="px-2 text-xs font-medium">{edge.type ?? "REL"}</div>
        </div>

        {/* ターゲットノード */}
        {targetNode && (
          <div className="flex flex-col items-start gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                isTargetNodeNew
                  ? "border-green-300 bg-green-500"
                  : isTargetNodeRemoved
                    ? "border-red-300 bg-red-500"
                    : "border-gray-400 bg-gray-600"
              }`}
            ></div>
            <span className="text-xs font-medium text-white">
              {targetNode.name ?? targetNode.id.slice(0, 2)}
            </span>
          </div>
        )}
      </div>
    );
  };

  const getChangeTypeColor = (changeType: GraphChangeType) => {
    switch (changeType) {
      case GraphChangeType.ADD:
        return "bg-green-100 text-green-800";
      case GraphChangeType.REMOVE:
        return "bg-red-100 text-red-800";
      case GraphChangeType.UPDATE:
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getEntityTypeColor = (entityType: GraphChangeEntityType) => {
    switch (entityType) {
      case GraphChangeEntityType.NODE:
        return "bg-purple-100 text-purple-800";
      case GraphChangeEntityType.EDGE:
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {changes.map((change, index) => {
        const isNodeChange =
          change.changeEntityType === GraphChangeEntityType.NODE;
        const isAdd = change.changeType === GraphChangeType.ADD;
        const isRemove = change.changeType === GraphChangeType.REMOVE;
        const isUpdate = change.changeType === GraphChangeType.UPDATE;

        const isExpanded = expandedChangeId === change.id;

        return (
          <div
            key={index}
            className="rounded-lg border border-gray-700 bg-slate-800 p-6"
          >
            {/* ヘッダー */}
            <div className="mb-4 flex items-center gap-2">
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${getChangeTypeColor(change.changeType)}`}
              >
                {change.changeType === GraphChangeType.UPDATE && "更新"}
                {change.changeType === GraphChangeType.ADD && "追加"}
                {change.changeType === GraphChangeType.REMOVE && "削除"}
              </span>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${getEntityTypeColor(change.changeEntityType)}`}
              >
                {change.changeEntityType === GraphChangeEntityType.NODE
                  ? "ノード"
                  : "エッジ"}
              </span>
              <span className="text-sm text-gray-400">
                ID: {change.changeEntityId}
              </span>
            </div>

            {/* 一覧表示 */}
            <div className="mb-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-300">一覧</h4>
              {isNodeChange ? (
                <div className="flex items-center gap-4">
                  {/* 変更前 */}
                  {!isAdd && Object.keys(change.previousState).length > 0 && (
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-xs text-gray-400">変更前</span>
                      {renderNode(
                        change.previousState as Node,
                        false,
                        isRemove,
                        change.id,
                      )}
                    </div>
                  )}

                  {/* 矢印 */}
                  {isUpdate && <div className="text-gray-400">→</div>}

                  {/* 変更後 */}
                  {!isRemove && Object.keys(change.nextState).length > 0 && (
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-xs text-gray-400">変更後</span>
                      {renderNode(
                        change.nextState as Node,
                        isAdd,
                        false,
                        change.id,
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {/* 変更前 */}
                  {!isAdd && Object.keys(change.previousState).length > 0 && (
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-xs text-gray-400">変更前</span>
                      {renderEdgeWithNodes(
                        change.previousState as Edge,
                        false,
                        isRemove,
                        change.id,
                      )}
                    </div>
                  )}

                  {/* 矢印 */}
                  {isUpdate && <div className="text-gray-400">→</div>}

                  {/* 変更後 */}
                  {!isRemove && Object.keys(change.nextState).length > 0 && (
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-xs text-gray-400">変更後</span>
                      {renderEdgeWithNodes(
                        change.nextState as Edge,
                        isAdd,
                        false,
                        change.id,
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 詳細情報 */}
            {isExpanded && (
              <div className="mb-4 rounded-lg bg-slate-700 p-3">
                <h5 className="mb-2 text-sm font-semibold text-gray-300">
                  変更詳細
                </h5>
                <div className="space-y-3 text-xs">
                  {/* 変更前の状態 */}
                  {!isAdd && Object.keys(change.previousState).length > 0 && (
                    <div>
                      <span className="font-medium text-gray-400">変更前:</span>
                      <pre className="mt-1 rounded bg-pink-950/40 p-2 text-gray-300">
                        {JSON.stringify(change.previousState, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* 変更後の状態 */}
                  {!isRemove && Object.keys(change.nextState).length > 0 && (
                    <div>
                      <span className="font-medium text-gray-400">変更後:</span>
                      <pre className="mt-1 rounded bg-green-950/40 p-2 text-gray-300">
                        {JSON.stringify(change.nextState, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
