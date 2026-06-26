"use client";

import React from "react";
import { api } from "@/trpc/react";
import { PublicAnnotationList } from "./public-annotation-list";
import { useTranslations } from "next-intl";
import type { CustomNodeType } from "@/app/const/types";

interface PublicNodeAnnotationSectionProps {
  node: CustomNodeType;
  topicSpaceId: string;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
}

export const PublicNodeAnnotationSection: React.FC<
  PublicNodeAnnotationSectionProps
> = ({ node, topicSpaceId, setFocusedNode }) => {
  const tAnnotation = useTranslations("annotation");
  // ノードの注釈を取得
  const { data: annotations } =
    api.annotation.getNodeAnnotationsPublic.useQuery(
      {
        nodeId: node.id,
      },
      {
        enabled: !!node.id,
      },
    );

  return (
    <div className="mb-4">
      <h3 className="mb-2 border-b border-slate-600 pb-1 text-sm font-semibold text-gray-200">
        {tAnnotation("title")}
      </h3>
      {annotations && (
        <PublicAnnotationList
          annotations={annotations}
          topicSpaceId={topicSpaceId}
          setFocusedNode={setFocusedNode}
        />
      )}
    </div>
  );
};
