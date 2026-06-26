"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/trpc/react";

type PickedFolder = {
  id: string;
  name: string;
};

type GoogleDriveFolderPickerProps = {
  disabled?: boolean;
  onPick: (folder: PickedFolder) => void;
};

type PickerDocument = {
  id: string;
  name: string;
  mimeType?: string;
};

type PickerResponse = {
  action: string;
  docs?: PickerDocument[];
};

declare global {
  interface Window {
    gapi?: {
      load: (name: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        Action: { PICKED: string };
        DocsView: new (viewId?: string) => unknown;
        PickerBuilder: new () => unknown;
        ViewId: { FOLDERS: string };
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function GoogleDriveFolderPicker({
  disabled,
  onPick,
}: GoogleDriveFolderPickerProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerConfigQuery = api.googleDrive.getPickerConfig.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadScript("https://apis.google.com/js/api.js");
        if (cancelled) return;
        window.gapi?.load("picker", () => {
          if (!cancelled) setReady(true);
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Picker の読み込みに失敗しました",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPicker = useCallback(async () => {
    setError(null);
    const result = await pickerConfigQuery.refetch();
    const config = result.data;
    const picker = window.google?.picker;

    if (!config || !picker || !ready) {
      setError("Google Picker の準備ができていません");
      return;
    }

    const view = new picker.DocsView(picker.ViewId.FOLDERS);
    (view as { setIncludeFolders: (v: boolean) => void }).setIncludeFolders(true);
    (view as { setSelectFolderEnabled: (v: boolean) => void }).setSelectFolderEnabled(true);

    const builder = new picker.PickerBuilder();
    const chain = builder as {
      addView: (v: unknown) => typeof chain;
      setOAuthToken: (token: string) => typeof chain;
      setDeveloperKey: (key: string) => typeof chain;
      setAppId: (appId: string) => typeof chain;
      setTitle: (title: string) => typeof chain;
      setCallback: (callback: (data: PickerResponse) => void) => typeof chain;
      build: () => { setVisible: (visible: boolean) => void };
    };

    const pickerInstance = chain
      .addView(view)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setTitle("同期するフォルダを選択")
      .setCallback((data: PickerResponse) => {
        if (data.action !== picker.Action.PICKED || !data.docs?.[0]) return;
        const doc = data.docs[0];
        onPick({ id: doc.id, name: doc.name });
      })
      .build();

    pickerInstance.setVisible(true);
  }, [onPick, pickerConfigQuery, ready]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={(disabled ?? false) || !ready || pickerConfigQuery.isFetching}
        onClick={() => void openPicker()}
        className="rounded bg-blue-600 px-3 py-1 text-xs hover:bg-blue-500 disabled:opacity-50"
      >
        {pickerConfigQuery.isFetching ? "準備中..." : "フォルダを選ぶ"}
      </button>
      {(error ?? pickerConfigQuery.error?.message) && (
        <p className="text-xs text-red-400">
          {error ?? pickerConfigQuery.error?.message}
        </p>
      )}
    </div>
  );
}
