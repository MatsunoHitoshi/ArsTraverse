"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { NodeAnnotationSection } from "../view/node/node-annotation-section";
import { NodeImageFormSection } from "../form/node-image-form-section";
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";

interface NodeDetailPanelProps {
  activeEntity: CustomNodeType | undefined;
  topicSpaceId: string;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  onGraphUpdate: (additionalGraph: GraphDocumentForFrontend) => void;
  currentGraph?: GraphDocumentForFrontend | null;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  activeEntity,
  topicSpaceId,
  setFocusedNode,
  setIsGraphEditor,
  onGraphUpdate,
  currentGraph,
}) => {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");

  if (!activeEntity) {
    return (
      <div className="min-h-full rounded-b-lg border border-gray-300 bg-slate-900 p-4 shadow-sm">
        <h2 className="text-md mb-4 font-semibold text-gray-400">
          {tCommon("detail")}
        </h2>
        <p className="text-gray-300">{t("nodeDetailEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll rounded-b-lg border border-gray-300 bg-slate-900 p-4 shadow-sm">
      <div className="text-white">
        <h3 className="font-semibold text-white">{activeEntity.name}</h3>
        <p className="text-sm text-gray-400">{activeEntity.label}</p>
        <p className="mt-2 text-sm">
          {String(activeEntity.properties?.description ?? "No description")}
        </p>

        <div className="mt-3">
          <NodeImageFormSection
            topicSpaceId={topicSpaceId}
            node={activeEntity}
            onSaveSuccess={(updatedNode) => {
              if (currentGraph) {
                const newGraph: GraphDocumentForFrontend = {
                  nodes: currentGraph.nodes.map((n) =>
                    n.id === updatedNode.id ? updatedNode : n,
                  ),
                  relationships: currentGraph.relationships,
                };
                onGraphUpdate(newGraph);
              }
            }}
          />
        </div>

        <div className="my-3 border-b border-gray-400" />
      </div>

      <NodeAnnotationSection
        node={activeEntity}
        topicSpaceId={topicSpaceId}
        setFocusedNode={setFocusedNode}
        setIsGraphEditor={setIsGraphEditor}
        onGraphUpdate={onGraphUpdate}
      />
    </div>
  );
};
