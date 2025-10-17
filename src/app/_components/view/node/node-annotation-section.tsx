"use client";

import React, { Fragment, useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../../button/button";
import { AnnotationList } from "../../curators-writing-workspace/annotation-list";
import { AnnotationForm } from "../../curators-writing-workspace/annotation-form";
import { NodeReferencePanel } from "./node-reference-panel";
import type { CustomNodeType } from "@/app/const/types";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";

interface NodeAnnotationSectionProps {
  node: CustomNodeType;
  topicSpaceId: string;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
}

export const NodeAnnotationSection: React.FC<NodeAnnotationSectionProps> = ({
  node,
  topicSpaceId,
  setFocusedNode,
}) => {
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [defaultAnnotationContent, setDefaultAnnotationContent] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);

  const generateNodeDescriptionFromDocument =
    api.topicSpaces.generateNodeDescriptionFromDocument.useMutation();

  // ノードの注釈を取得
  const { data: annotations, refetch: refetchAnnotations } =
    api.annotation.getNodeAnnotations.useQuery(
      {
        nodeId: node.id,
      },
      {
        enabled: !!node.id,
      },
    );

  const handleGenerateAnnotationFromDocument = () => {
    // まずモーダルを開く
    setShowAnnotationForm(true);
    setDefaultAnnotationContent("解説文を生成中...");
    setIsGenerating(true);

    // ストリーミングで解説文を生成
    generateNodeDescriptionFromDocument.mutate(
      {
        id: topicSpaceId,
        nodeId: node.id,
      },
      {
        onSuccess: (data) => {
          // ストリーミングデータの処理
          if (data && typeof data[Symbol.asyncIterator] === "function") {
            void (async () => {
              try {
                for await (const chunk of data) {
                  setDefaultAnnotationContent(chunk.description);
                  if (chunk.isComplete) {
                    setIsGenerating(false);
                    console.log("解説文生成完了");
                  }
                }
              } catch (error) {
                console.error("ストリーミング処理エラー:", error);
                setIsGenerating(false);
              }
            })();
          } else {
            // 通常のレスポンスの場合（このケースは発生しないはず）
            console.error("予期しないレスポンス形式:", data);
            setIsGenerating(false);
          }
        },
        onError: (error) => {
          console.error("解説文生成エラー:", error);
          setDefaultAnnotationContent("解説文の生成に失敗しました");
          setIsGenerating(false);
        },
      },
    );
  };

  return (
    <div className="mb-4">
      <TabGroup>
        <div className="sticky -top-4 z-10 mb-2 flex items-center justify-between border-b border-slate-600 bg-slate-900 pt-1">
          <TabList className="flex flex-row items-center gap-2 text-sm text-gray-200">
            <Tab as={Fragment}>
              {({ hover, selected }) => (
                <div
                  className={`flex cursor-pointer rounded-t-sm px-3 py-2 text-sm font-semibold ${
                    selected ? "border-b-2 border-white outline-none" : ""
                  } ${hover ? "bg-white/10" : ""}`}
                >
                  注釈
                </div>
              )}
            </Tab>
            <Tab as={Fragment}>
              {({ hover, selected }) => (
                <div
                  className={`flex cursor-pointer rounded-t-sm px-3 py-2 text-sm font-semibold ${
                    selected ? "border-b-2 border-white outline-none" : ""
                  } ${hover ? "bg-white/10" : ""}`}
                >
                  引用
                </div>
              )}
            </Tab>
          </TabList>

          <Button
            size="small"
            onClick={() => setShowAnnotationForm(true)}
            className="text-xs"
            disabled={isGenerating}
          >
            {isGenerating ? "生成中..." : "注釈を追加"}
          </Button>
        </div>

        <TabPanels>
          <TabPanel>
            {annotations && (
              <AnnotationList
                annotations={annotations}
                onRefetch={refetchAnnotations}
                topicSpaceId={topicSpaceId}
                handleGenerateAnnotationFromDocument={
                  handleGenerateAnnotationFromDocument
                }
                setFocusedNode={setFocusedNode}
              />
            )}
          </TabPanel>
          <TabPanel>
            <NodeReferencePanel node={node} topicSpaceId={topicSpaceId} />
          </TabPanel>
        </TabPanels>
      </TabGroup>

      {/* 注釈フォーム */}
      <AnnotationForm
        targetType="node"
        targetId={node.id}
        topicSpaceId={topicSpaceId}
        isOpen={showAnnotationForm}
        setIsOpen={setShowAnnotationForm}
        onSuccess={() => {
          void refetchAnnotations();
        }}
        defaultAnnotationType="CLARIFICATION"
        defaultAnnotationContent={defaultAnnotationContent}
      />
    </div>
  );
};
