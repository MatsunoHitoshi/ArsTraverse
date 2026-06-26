"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";
import { LinkButton } from "../button/link-button";
import { api } from "@/trpc/react";
import { WorkspaceStatus } from "@prisma/client";
import { Link2Icon, PaperRollIcon, VideoIcon } from "../icons";
import { Link } from "i18n/navigation";

const PrintOutputButton: React.FC<{ workspaceId: string }> = ({
  workspaceId,
}) => {
  const t = useTranslations("workspace");
  return (
    <LinkButton
      target="_blank"
      size="small"
      href={`/workspaces/${workspaceId}/print-preview`}
      className="inline-flex w-max items-center gap-2 text-sm text-slate-400 hover:text-slate-300"
    >
      <PaperRollIcon width={14} height={14} />
      <span>{t("printOutput")}</span>
    </LinkButton>
  );
};

const VideoExportButton: React.FC<{ onClick?: () => void }> = ({
  onClick,
}) => {
  const t = useTranslations("workspace");
  return (
    <Button
      type="button"
      onClick={onClick}
      size="small"
      className="flex items-center gap-2 text-slate-400 hover:text-slate-300"
    >
      <VideoIcon width={14} height={14} />
      <span>{t("videoExport")}</span>
    </Button>
  );
};

interface PublishWorkspaceModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceId: string;
  workspaceStatus: WorkspaceStatus;
  workspaceName: string;
  hasStories?: boolean;
  onSuccess?: () => void;
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
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");
  const [isPublished, setIsPublished] = useState(false);
  const [publishedWorkspaceId, setPublishedWorkspaceId] = useState<
    string | null
  >(null);

  const handleClose = () => {
    setIsOpen(false);
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

  useEffect(() => {
    if (isOpen && workspaceStatus === WorkspaceStatus.PUBLISHED) {
      setPublishedWorkspaceId(workspaceId);
    }
  }, [isOpen, workspaceStatus, workspaceId]);

  if (workspaceStatus === WorkspaceStatus.PUBLISHED && !isPublished) {
    return (
      <Modal
        isOpen={isOpen}
        setIsOpen={handleClose}
        title={t("publishStatusTitle")}
        size="medium"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-blue-900/50 p-3 text-sm text-blue-200">
              <p>{t("alreadyPublished")}</p>
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
                  {t("unpublishFailed")}{" "}
                  {unpublishWorkspace.error?.message ?? tCommon("unknownError")}
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
              {tCommon("close")}
            </Button>
            <Button
              type="button"
              onClick={handleUnpublish}
              disabled={unpublishWorkspace.isPending}
              className="!text-red-600 hover:!text-red-400"
            >
              {unpublishWorkspace.isPending
                ? t("unpublishing")
                : t("unpublish")}
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
      title={t("publishTitle")}
      size="medium"
    >
      <div className="flex flex-col gap-6">
        {!isPublished ? (
          <>
            <div className="text-sm text-slate-300">{t("publishConfirm")}</div>

            {publishWorkspace.isError && (
              <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
                <p>
                  {t("publishFailed")}{" "}
                  {publishWorkspace.error?.message ?? tCommon("unknownError")}
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
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                onClick={handlePublish}
                disabled={publishWorkspace.isPending}
              >
                {publishWorkspace.isPending
                  ? t("publishing")
                  : t("publishAction")}
              </Button>
            </div>
          </>
        ) : publishedWorkspaceId ? (
          <>
            <div className="flex flex-col gap-4">
              <div className="rounded-md bg-green-900/50 p-3 text-sm text-green-200">
                <p>{t("publishedSuccess")}</p>
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
                {tCommon("close")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
              <p>
                {t("publishFailed")}{" "}
                {publishWorkspace.error?.message ?? tCommon("unknownError")}
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
                {tCommon("close")}
              </Button>
              <Button type="button" onClick={handlePublish}>
                {tCommon("retry")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
