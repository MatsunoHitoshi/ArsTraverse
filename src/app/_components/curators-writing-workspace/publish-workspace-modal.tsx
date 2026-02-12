import { useState, useEffect } from "react";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";
import { LinkButton } from "../button/link-button";
import { api } from "@/trpc/react";
import { WorkspaceStatus } from "@prisma/client";
import { Link2Icon, PaperRollIcon } from "../icons";
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

/** 検索エンジン公開設定のトグルコンポーネント */
const SearchableToggle: React.FC<{
  isSearchable: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}> = ({ isSearchable, onChange, disabled = false }) => (
  <div className="flex flex-col gap-2 rounded-md border border-slate-600 p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-slate-200">
          検索エンジンに公開
        </span>
        <span className="text-xs text-slate-400">
          有効にすると、GoogleなどのWeb検索結果に表示されるようになります
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isSearchable}
        disabled={disabled}
        onClick={() => onChange(!isSearchable)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } ${isSearchable ? "bg-blue-600" : "bg-slate-600"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            isSearchable ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  </div>
);

interface PublishWorkspaceModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceId: string;
  workspaceStatus: WorkspaceStatus;
  workspaceName: string;
  /** 現在の isSearchable 値（公開済みの場合のみ） */
  isSearchable?: boolean;
  /** ストーリーが生成されている場合のみ出力ボタンを表示する */
  hasStories?: boolean;
  onSuccess?: () => void;
}

export const PublishWorkspaceModal: React.FC<PublishWorkspaceModalProps> = ({
  isOpen,
  setIsOpen,
  workspaceId,
  workspaceStatus,
  workspaceName,
  isSearchable: initialIsSearchable = false,
  hasStories = false,
  onSuccess,
}) => {
  const [isPublished, setIsPublished] = useState(false);
  const [publishedWorkspaceId, setPublishedWorkspaceId] = useState<
    string | null
  >(null);
  const [isSearchable, setIsSearchable] = useState(initialIsSearchable);

  // 初期値が変わったら反映
  useEffect(() => {
    setIsSearchable(initialIsSearchable);
  }, [initialIsSearchable]);

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

  const updateSearchable = api.workspace.updateSearchable.useMutation({
    onSuccess: () => {
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      console.error("検索設定更新エラー:", error);
    },
  });

  const handlePublish = () => {
    publishWorkspace.mutate({ workspaceId, isSearchable });
  };

  const handleUnpublish = () => {
    unpublishWorkspace.mutate({
      id: workspaceId,
      status: "DRAFT",
    });
  };

  const handleSearchableChange = (value: boolean) => {
    setIsSearchable(value);
    // 既に公開済みの場合はすぐにAPIで保存
    if (workspaceStatus === WorkspaceStatus.PUBLISHED) {
      updateSearchable.mutate({ workspaceId, isSearchable: value });
    }
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

            <SearchableToggle
              isSearchable={isSearchable}
              onChange={handleSearchableChange}
              disabled={updateSearchable.isPending}
            />

            {updateSearchable.isSuccess && (
              <div className="rounded-md bg-green-900/50 p-2 text-xs text-green-200">
                検索エンジン公開設定を更新しました
              </div>
            )}

            {updateSearchable.isError && (
              <div className="rounded-md bg-red-900/50 p-2 text-xs text-red-200">
                設定の更新に失敗しました: {updateSearchable.error?.message ?? "不明なエラー"}
              </div>
            )}

            {unpublishWorkspace.isError && (
              <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
                <p>
                  非公開にできませんでした:{" "}
                  {unpublishWorkspace.error?.message ?? "不明なエラー"}
                </p>
              </div>
            )}

            {hasStories && (
              <div className="pt-2">
                <PrintOutputButton workspaceId={workspaceId} />
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

            <SearchableToggle
              isSearchable={isSearchable}
              onChange={setIsSearchable}
            />

            {publishWorkspace.isError && (
              <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-200">
                <p>
                  公開できませんでした:{" "}
                  {publishWorkspace.error?.message ?? "不明なエラー"}
                </p>
              </div>
            )}

            {hasStories && (
              <div className="pt-2">
                <PrintOutputButton workspaceId={workspaceId} />
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

              {isSearchable && (
                <div className="rounded-md bg-blue-900/50 p-2 text-xs text-blue-200">
                  検索エンジンへの公開が有効です。しばらくするとWeb検索結果に表示されるようになります。
                </div>
              )}

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
                <div className="pt-2">
                  <PrintOutputButton workspaceId={workspaceId} />
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
              <div className="pt-2">
                <PrintOutputButton workspaceId={workspaceId} />
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
