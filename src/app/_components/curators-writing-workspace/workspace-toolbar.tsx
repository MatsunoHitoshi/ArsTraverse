"use client";

import { Button } from "@/app/_components/button/button";
import { LinkButton } from "@/app/_components/button/link-button";
import {
  ChevronLeftIcon,
  PinLeftIcon,
  PinRightIcon,
  ShareIcon,
  StackIcon,
} from "@/app/_components/icons";
import { EditableTitle } from "./editable-title";
import type { Workspace } from "@prisma/client";
import { WorkspaceStatus } from "@prisma/client";
import type { GraphDocumentForFrontend } from "@/app/const/types";

interface WorkspaceToolbarProps {
  workspace: Workspace;
  displayTitle: string;
  onTitleSave: (newTitle: string) => void;
  isTitlePending: boolean;
  isStorytellingMode: boolean;
  onStorytellingModeToggle: () => void;
  isMetaGraphMode: boolean;
  onMetaGraphModeToggle: () => void;
  isRightPanelOpen: boolean;
  onRightPanelToggle: () => void;
  onPublish: () => void;
  onShare: () => void;
  graphDocument: GraphDocumentForFrontend | null;
  isMetaGraphGenerating: boolean;
}

export const WorkspaceToolbar = ({
  workspace,
  displayTitle,
  onTitleSave,
  isTitlePending,
  isStorytellingMode,
  onStorytellingModeToggle,
  isMetaGraphMode,
  onMetaGraphModeToggle,
  isRightPanelOpen,
  onRightPanelToggle,
  onPublish,
  onShare,
  graphDocument,
  isMetaGraphGenerating,
}: WorkspaceToolbarProps) => {
  return (
    <div className="mb-2 flex w-full flex-row items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <LinkButton
          href="/workspaces"
          className="flex !h-8 !w-8 items-center justify-center"
        >
          <div className="h-4 w-4">
            <ChevronLeftIcon height={16} width={16} color="white" />
          </div>
        </LinkButton>
        <EditableTitle
          title={displayTitle}
          onSave={onTitleSave}
          isPending={isTitlePending}
        />
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="small"
          onClick={onPublish}
          className="flex items-center gap-1"
        >
          <ShareIcon
            height={16}
            width={16}
            color={
              workspace.status === WorkspaceStatus.PUBLISHED ? "green" : "white"
            }
          />
        </Button>
        <Button
          size="small"
          onClick={onStorytellingModeToggle}
          className={`flex items-center gap-1 ${
            isStorytellingMode ? "bg-purple-600" : ""
          }`}
        >
          <StackIcon height={16} width={16} color="white" />
          ストーリーテリングモード
        </Button>
        {graphDocument && (
          <Button
            size="small"
            onClick={onMetaGraphModeToggle}
            className={`flex items-center gap-1 ${
              isMetaGraphMode ? "bg-indigo-600" : ""
            }`}
            disabled={isMetaGraphGenerating}
          >
            {isMetaGraphGenerating
              ? "生成中..."
              : isMetaGraphMode
                ? "詳細表示"
                : "メタグラフ表示"}
          </Button>
        )}
        <Button
          size="small"
          onClick={onRightPanelToggle}
          className="flex items-center gap-1"
        >
          {isRightPanelOpen ? (
            <PinRightIcon height={16} width={16} color="white" />
          ) : (
            <PinLeftIcon height={16} width={16} color="white" />
          )}
        </Button>
      </div>
    </div>
  );
};
