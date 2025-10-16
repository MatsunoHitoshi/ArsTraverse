import { useEffect, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";

interface UseGraphEditorProps {
  defaultGraphDocument?: GraphDocumentForFrontend | null;
  onUpdateSuccess?: () => void;
  onUpdateError?: (error: Error | string) => void;
}

interface UseGraphEditorReturn {
  // グラフデータの状態管理
  graphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;

  // 編集状態の管理
  isEditor: boolean;
  setIsEditor: React.Dispatch<React.SetStateAction<boolean>>;
  isGraphUpdated: boolean;

  // モーダルの状態管理
  isNodePropertyEditModalOpen: boolean;
  setIsNodePropertyEditModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLinkPropertyEditModalOpen: boolean;
  setIsLinkPropertyEditModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isNodeLinkAttachModalOpen: boolean;
  setIsNodeLinkAttachModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // フォーカス状態の管理
  focusedNode: CustomNodeType | undefined;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  focusedLink: CustomLinkType | undefined;
  setFocusedLink: React.Dispatch<
    React.SetStateAction<CustomLinkType | undefined>
  >;

  // 追加グラフの状態管理
  additionalGraph: GraphDocumentForFrontend | undefined;
  setAdditionalGraph: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | undefined>
  >;

  // イベントハンドラー
  onNodeContextMenu: (node: CustomNodeType) => void;
  onLinkContextMenu: (link: CustomLinkType) => void;
  onGraphUpdate: (additionalGraph: GraphDocumentForFrontend) => void;
  resetGraphUpdated: () => void;
}

export const useGraphEditor = ({
  defaultGraphDocument,
  onUpdateSuccess,
  onUpdateError,
}: UseGraphEditorProps): UseGraphEditorReturn => {
  // グラフデータの状態管理
  const [graphDocument, setGraphDocument] =
    useState<GraphDocumentForFrontend | null>(null);

  // 初期状態を保持（比較の基準として使用）
  const [initialGraphDocument, setInitialGraphDocument] =
    useState<GraphDocumentForFrontend | null>(null);

  // 編集状態の管理
  const [isEditor, setIsEditor] = useState<boolean>(false);
  const [isGraphUpdated, setIsGraphUpdated] = useState<boolean>(false);

  // モーダルの状態管理
  const [isNodePropertyEditModalOpen, setIsNodePropertyEditModalOpen] =
    useState(false);
  const [isLinkPropertyEditModalOpen, setIsLinkPropertyEditModalOpen] =
    useState(false);
  const [isNodeLinkAttachModalOpen, setIsNodeLinkAttachModalOpen] =
    useState(false);

  // フォーカス状態の管理
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );

  // 追加グラフの状態管理
  const [additionalGraph, setAdditionalGraph] = useState<
    GraphDocumentForFrontend | undefined
  >(undefined);

  // デフォルトグラフデータが変更されたときにローカル状態を更新
  useEffect(() => {
    setGraphDocument(defaultGraphDocument ?? null);
    // 初期状態も更新（初回のみ）
    if (!initialGraphDocument && defaultGraphDocument) {
      setInitialGraphDocument(defaultGraphDocument);
    }
  }, [defaultGraphDocument, initialGraphDocument]);

  // グラフの変更を検知して更新フラグを設定
  useEffect(() => {
    const nodeDiff = diffNodes(
      initialGraphDocument?.nodes ?? [],
      graphDocument?.nodes ?? [],
    );
    const relationshipDiff = diffRelationships(
      initialGraphDocument?.relationships ?? [],
      graphDocument?.relationships ?? [],
    );
    const hasChanges = nodeDiff.length > 0 || relationshipDiff.length > 0;
    console.log("Graph diff check:", {
      nodeDiff: nodeDiff.length,
      relationshipDiff: relationshipDiff.length,
      hasChanges,
      initialNodes: initialGraphDocument?.nodes?.length ?? 0,
      currentNodes: graphDocument?.nodes?.length ?? 0,
    });
    setIsGraphUpdated(hasChanges);
  }, [graphDocument, initialGraphDocument]);

  // ノードコンテキストメニューハンドラー
  const onNodeContextMenu = (node: CustomNodeType) => {
    setFocusedNode(node);
    setIsNodePropertyEditModalOpen(true);
  };

  // リンクコンテキストメニューハンドラー
  const onLinkContextMenu = (link: CustomLinkType) => {
    setFocusedLink(link);
    setIsLinkPropertyEditModalOpen(true);
  };

  // グラフ更新ハンドラー（追加グラフ用）
  const onGraphUpdate = (additionalGraph: GraphDocumentForFrontend) => {
    setAdditionalGraph(additionalGraph);
    setIsNodeLinkAttachModalOpen(true);
  };

  // グラフ更新フラグをリセット
  const resetGraphUpdated = () => {
    setIsGraphUpdated(false);
    // 初期状態を現在の状態に更新
    if (graphDocument) {
      setInitialGraphDocument(graphDocument);
    }
  };

  return {
    // グラフデータの状態管理
    graphDocument,
    setGraphDocument,

    // 編集状態の管理
    isEditor,
    setIsEditor,
    isGraphUpdated,

    // モーダルの状態管理
    isNodePropertyEditModalOpen,
    setIsNodePropertyEditModalOpen,
    isLinkPropertyEditModalOpen,
    setIsLinkPropertyEditModalOpen,
    isNodeLinkAttachModalOpen,
    setIsNodeLinkAttachModalOpen,

    // フォーカス状態の管理
    focusedNode,
    setFocusedNode,
    focusedLink,
    setFocusedLink,

    // 追加グラフの状態管理
    additionalGraph,
    setAdditionalGraph,

    // イベントハンドラー
    onNodeContextMenu,
    onLinkContextMenu,
    onGraphUpdate,
    resetGraphUpdated,
  };
};
