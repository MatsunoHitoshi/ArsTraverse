"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { GoogleDriveFolderPicker } from "./google-drive-folder-picker";

type TopicSpaceDriveSyncPanelProps = {
  topicSpaceId: string;
  onSynced?: () => void;
};

export function TopicSpaceDriveSyncPanel({
  topicSpaceId,
  onSynced,
}: TopicSpaceDriveSyncPanelProps) {
  const pathname = usePathname();
  const statusQuery = api.topicSpaces.getDriveSyncStatus.useQuery({
    id: topicSpaceId,
  });
  const driveConnectionQuery = api.googleDrive.getConnectionStatus.useQuery();
  const upsertConfig = api.topicSpaces.upsertDriveSyncConfig.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const syncDrive = api.topicSpaces.syncDriveFolder.useMutation({
    onSuccess: () => {
      void statusQuery.refetch();
      onSynced?.();
    },
  });
  const disconnectDrive = api.googleDrive.disconnect.useMutation({
    onSuccess: () => {
      void driveConnectionQuery.refetch();
      void statusQuery.refetch();
    },
  });

  const [folderName, setFolderName] = useState("");
  const [recursive, setRecursive] = useState(true);

  const status = statusQuery.data;
  const driveConnection = driveConnectionQuery.data;
  const isBusy =
    upsertConfig.isPending || syncDrive.isPending || disconnectDrive.isPending;

  useEffect(() => {
    if (status?.driveFolderName) setFolderName(status.driveFolderName);
    if (status?.recursive !== undefined) setRecursive(status.recursive);
  }, [status?.driveFolderName, status?.recursive]);

  const connectUrl = `/api/google-drive/connect?returnTo=${encodeURIComponent(pathname)}`;

  const saveFolder = (folder: { id: string; name: string }) => {
    setFolderName(folder.name);
    upsertConfig.mutate({
      id: topicSpaceId,
      driveFolderId: folder.id,
      driveFolderName: folder.name,
      enabled: true,
      recursive,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-700/60 bg-slate-900/30 p-3">
      <div className="text-sm font-semibold">Google Drive 同期</div>
      <p className="text-xs text-slate-400">
        ログイン中の Google アカウントの Drive フォルダを選び、資料を TopicSpace
        に取り込みます。
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {driveConnection?.connected ? (
          <>
            <span className="text-emerald-400">Drive 連携済み</span>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => disconnectDrive.mutate()}
              className="text-slate-400 underline hover:text-slate-200"
            >
              連携解除
            </button>
          </>
        ) : (
          <a
            href={connectUrl}
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500"
          >
            Google Drive を連携
          </a>
        )}
      </div>

      {driveConnection?.connected && (
        <div className="flex flex-col gap-2 rounded border border-slate-700/50 p-2">
          <div className="text-xs text-slate-300">
            {folderName || status?.driveFolderName
              ? `選択中: ${folderName || status?.driveFolderName}`
              : "同期フォルダ未選択"}
          </div>
          <GoogleDriveFolderPicker
            disabled={isBusy}
            onPick={saveFolder}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={recursive}
          onChange={(event) => setRecursive(event.target.checked)}
        />
        サブフォルダも再帰的に同期
      </label>

      <div className="flex flex-wrap gap-2">
        {status?.configured && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              upsertConfig.mutate({
                id: topicSpaceId,
                driveFolderId: status.driveFolderId!,
                driveFolderName: folderName
                  ? folderName
                  : (status.driveFolderName ?? undefined),
                enabled: true,
                recursive,
              })
            }
            className="rounded bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
          >
            設定を保存
          </button>
        )}
        <button
          type="button"
          disabled={isBusy || !status?.configured}
          onClick={() => syncDrive.mutate({ id: topicSpaceId })}
          className="rounded bg-orange-600 px-3 py-1 text-xs hover:bg-orange-500 disabled:opacity-50"
        >
          {syncDrive.isPending ? "同期中..." : "今すぐ同期"}
        </button>
        {status?.driveFolderUrl && (
          <a
            href={status.driveFolderUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-600 px-3 py-1 text-xs hover:bg-slate-800"
          >
            フォルダを開く
          </a>
        )}
      </div>

      {status?.lastSyncedAt && (
        <div className="text-xs text-slate-400">
          最終同期: {new Date(status.lastSyncedAt).toLocaleString("ja-JP")}
          {status.lastSyncStatus ? ` (${status.lastSyncStatus})` : ""}
        </div>
      )}
      {status?.lastSyncError && (
        <div className="text-xs text-red-400">{status.lastSyncError}</div>
      )}
      {syncDrive.data && (
        <div className="text-xs text-emerald-400">
          作成 {syncDrive.data.created} / 更新 {syncDrive.data.updated} / スキップ{" "}
          {syncDrive.data.skipped} / 削除 {syncDrive.data.detached}
        </div>
      )}
      {(upsertConfig.error ?? syncDrive.error ?? disconnectDrive.error) && (
        <div className="text-xs text-red-400">
          {(upsertConfig.error ?? syncDrive.error ?? disconnectDrive.error)?.message}
        </div>
      )}
    </div>
  );
}
