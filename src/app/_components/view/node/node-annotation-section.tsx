"use client";
import React, { Fragment, useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../../button/button";
import { AnnotationList } from "../../curators-writing-workspace/annotation-list";
import { AnnotationForm } from "../../curators-writing-workspace/annotation-form";
import { NodeReferencePanel } from "./node-reference-panel";
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useTranslations } from "next-intl";

interface NodeAnnotationSectionProps {
  node: CustomNodeType;
  topicSpaceId: string;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  onGraphUpdate: (additionalGraph: GraphDocumentForFrontend) => void;
}

export const NodeAnnotationSection: React.FC<NodeAnnotationSectionProps> = ({
  node,
  topicSpaceId,
  setFocusedNode,
  setIsGraphEditor,
  onGraphUpdate,
}) => {
  const t = useTranslations("view");
  const tAnnotation = useTranslations("annotation");
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
    setDefaultAnnotationContent(t("generatingDescription"));
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
          console.error("生成エラー:", error);
          setDefaultAnnotationContent(t("generationFailed"));
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
                  {tAnnotation("title")}
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
                  {t("citation")}
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
            {isGenerating ? t("generating") : t("addAnnotation")}
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
                setIsGraphEditor={setIsGraphEditor}
                onGraphUpdate={onGraphUpdate}
                node={node}
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
