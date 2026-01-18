"use client";

import type {
  CustomNodeType,
  GraphDocumentForFrontend,
  CuratorialContext,
} from "@/app/const/types";
import { CopilotChat } from "./copilot/copilot-chat";
import { NodeDetailPanel } from "./node-detail-panel";
import type { LayoutInstruction } from "@/app/const/types";

interface RightPanelContainerProps {
  rightPanelMode: "detail" | "copilot";
  activeEntity: CustomNodeType | undefined;
  topicSpaceId: string | null | undefined;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  onGraphUpdate: (additionalGraph: GraphDocumentForFrontend) => void;
  workspaceId: string;
  currentGraphData: GraphDocumentForFrontend | null;
  curatorialContext: CuratorialContext | null;
  onLayoutInstruction: (instruction: LayoutInstruction | null) => void;
  onFilteredGraphData: (filteredGraph: GraphDocumentForFrontend | null) => void;
  isGraphEditor: boolean;
}

export const RightPanelContainer = ({
  rightPanelMode,
  activeEntity,
  topicSpaceId,
  setFocusedNode,
  setIsGraphEditor,
  onGraphUpdate,
  workspaceId,
  currentGraphData,
  curatorialContext,
  onLayoutInstruction,
  onFilteredGraphData,
  isGraphEditor,
}: RightPanelContainerProps) => {
  if (rightPanelMode === "copilot") {
    return (
      <CopilotChat
        workspaceId={workspaceId}
        currentGraphData={currentGraphData}
        curatorialContext={curatorialContext ?? undefined}
        onLayoutInstruction={onLayoutInstruction}
        onFilteredGraphData={onFilteredGraphData}
        className="h-full w-full"
      />
    );
  }

  if (topicSpaceId) {
    return (
      <NodeDetailPanel
        activeEntity={activeEntity}
        topicSpaceId={topicSpaceId}
        setFocusedNode={setFocusedNode}
        setIsGraphEditor={setIsGraphEditor}
        onGraphUpdate={onGraphUpdate}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-b-lg border border-t-0 border-gray-300 bg-slate-800 text-gray-400">
      <div className="text-center">
        <p className="text-sm">
          リポジトリを選択すると詳細パネルが表示されます
        </p>
      </div>
    </div>
  );
};
