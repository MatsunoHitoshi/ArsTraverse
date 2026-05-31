import { useState, useEffect } from "react";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";
import { LinkButton } from "../button/link-button";
import { api } from "@/trpc/react";
import { WorkspaceStatus } from "@prisma/client";
import { Link2Icon, PaperRollIcon, VideoIcon } from "../icons";
import Link from "next/link";

const PrintOutputButton: React.FC<{ workspaceId: string }> = ({
  workspaceId,
}) => (
  <LinkButton
    target="_blank"
    size="small"
    href={`/workspaces/${workspaceId}/print-preview`}
    className="inline-flex w-max items-center gap-2 text-sm text-slate-400 hover:text-slate-300"
  >
    <PaperRollIcon width={14} height={14} />
    <span>印刷出力</span>
  </LinkButton>
);

const VideoExportButton: React.FC<{ onClick?: () => void }> = ({
  onClick,
}) => (
  <Button
    type="button"
    onClick={onClick}
    size="small"
    className="flex items-center gap-2 text-slate-400 hover:text-slate-300"
  >
    <VideoIcon width={14} height={14} />
    <span>動画書き出し</span>
  </Button>
);

interface PublishWorkspaceModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceId: string;
  workspaceStatus: WorkspaceStatus;
  workspaceName: string;
  /** ストーリーが生成されている場合のみ出力ボタンを表示する */
  hasStories?: boolean;
  onSuccess?: () => void;
  /** 動画書き出しボタンクリック時のコールバック */
  onOpenVideoExport?: () => void;
}

export const PublishWorkspaceModal: React.FC<PublishWorkspaceModalProps> = ({
  isOpen,
  setIsOpen,
  workspaceId,
  workspaceStatus,
  workspaceName,
  hasStories = false,
  onSuccess,
  onOpenVideoExport,
}) => {
  const [isPublished, setIsPublished] = useState(false);
  const [publishedWorkspaceId, setPublishedWorkspaceId] = useState<
    string | null
  >(null);

  const handleClose = () => {
    setIsOpen(false);
    // モーダルを閉じる際に状態をリセット
    if (isPublished) {
      setIsPublished(false);
      setPublishedWorkspaceId(null);
    }
  };

  const publishWorkspace = api.workspace.publish.useMutation({
    onSuccess: (workspace) => {
      setIsPublished(true);
      setPublishedWorkspaceId(workspace.id);
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      console.error("公開エラー:", error);
    },
  });

  const unpublishWorkspace = api.workspace.update.useMutation({
    onSuccess: () => {
      if (onSuccess) {
        onSuccess();
      }
      handleClose();
    },
    onError: (error) => {
      console.error("非公開エラー:", error);
    },
  });

  const handlePublish = () => {
    publishWorkspace.mutate({ workspaceId });
  };

  const handleUnpublish = () => {
    unpublishWorkspace.mutate({
      id: workspaceId,
      status: "DRAFT",
    });
  };

  // モーダルが開かれたときに既に公開済みかどうかを確認
  useEffect(() => {
    if (isOpen && workspaceStatus === WorkspaceStatus.PUBLISHED) {
      setPublishedWorkspaceId(workspaceId);
    }
  }, [isOpen, workspaceStatus, workspaceId]);

  // 既に公開済みの場合の表示
  if (workspaceStatus === WorkspaceStatus.PUBLISHED && !isPublished) {
    return (
      <Modal
        isOpen={isOpen}
        setIsOpen={handleClose}
        title="記事の公開状態"
        size="medium"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-blue-900/50 p-3 text-sm text-blue-200">
              <p>この記事は既に公開されています。</p>
            </div>

            <div className="flex flex-col gap-2">
              <Link
                href={`/articles/${workspaceId}`}
                className="flex w-max flex-row items-center gap-2 text-center text-blue-400 underline hover:text-blue-300 hover:no-underline"
                target="_blank"
              >
                <Link2Icon height={18} width={18} color="lightblue" />
                {workspaceName}
              </Link>
            </div>

            {unpublishWorkspace.isError && (
              <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
                <p>
                  非公開にできませんでした:{" "}
                  {unpublishWorkspace.error?.message ?? "不明なエラー"}
                </p>
              </div>
            )}

            {hasStories && (
              <div className="flex flex-row flex-wrap items-center gap-3 pt-2">
                <PrintOutputButton workspaceId={workspaceId} />
                <VideoExportButton onClick={onOpenVideoExport} />
              </div>
            )}
          </div>

          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              onClick={handleClose}
              className="bg-slate-600 hover:bg-slate-700"
            >
              閉じる
            </Button>
            <Button
              type="button"
              onClick={handleUnpublish}
              disabled={unpublishWorkspace.isPending}
              className="!text-red-600 hover:!text-red-400"
            >
              {unpublishWorkspace.isPending ? "非公開中..." : "非公開に戻す"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={handleClose}
      title="記事を公開"
      size="medium"
    >
      <div className="flex flex-col gap-6">
        {!isPublished ? (
          <>
            <div className="text-sm text-slate-300">
              記事を公開しますか？公開後は一般公開され、誰でも閲覧できるようになります。
            </div>

            {publishWorkspace.isError && (
              <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
                <p>
                  公開できませんでした:{" "}
                  {publishWorkspace.error?.message ?? "不明なエラー"}
                </p>
              </div>
            )}

            {hasStories && (
              <div className="flex flex-row flex-wrap items-center gap-3 pt-2">
                <PrintOutputButton workspaceId={workspaceId} />
                <VideoExportButton onClick={onOpenVideoExport} />
              </div>
            )}

            <div className="flex flex-row justify-end gap-2">
              <Button
                type="button"
                onClick={handleClose}
                className="bg-slate-600 hover:bg-slate-700"
                disabled={publishWorkspace.isPending}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handlePublish}
                disabled={publishWorkspace.isPending}
              >
                {publishWorkspace.isPending ? "公開中..." : "公開する"}
              </Button>
            </div>
          </>
        ) : publishedWorkspaceId ? (
          <>
            <div className="flex flex-col gap-4">
              <div className="rounded-md bg-green-900/50 p-3 text-sm text-green-200">
                <p>記事が公開されました！</p>
              </div>

              <div className="flex flex-col gap-2">
                <Link
                  href={`/articles/${publishedWorkspaceId}`}
                  className="flex w-max flex-row items-center gap-2 text-center text-blue-400 underline hover:text-blue-300 hover:no-underline"
                  target="_blank"
                >
                  <Link2Icon height={18} width={18} color="lightblue" />
                  {workspaceName}
                </Link>
              </div>

              {hasStories && (
                <div className="flex flex-row flex-wrap items-center gap-3 pt-2">
                  <PrintOutputButton workspaceId={workspaceId} />
                  <VideoExportButton onClick={onOpenVideoExport} />
                </div>
              )}
            </div>

            <div className="flex flex-row justify-end gap-2">
              <Button type="button" onClick={handleClose}>
                閉じる
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
              <p>
                公開できませんでした:{" "}
                {publishWorkspace.error?.message ?? "不明なエラー"}
              </p>
            </div>

            {hasStories && (
              <div className="flex flex-row flex-wrap items-center gap-3 pt-2">
                <PrintOutputButton workspaceId={workspaceId} />
                <VideoExportButton onClick={onOpenVideoExport} />
              </div>
            )}

            <div className="flex flex-row justify-end gap-2">
              <Button
                type="button"
                onClick={handleClose}
                className="bg-slate-600 hover:bg-slate-700"
              >
                閉じる
              </Button>
              <Button type="button" onClick={handlePublish}>
                再試行
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
