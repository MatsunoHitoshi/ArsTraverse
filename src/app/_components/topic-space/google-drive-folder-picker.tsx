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
      load: (
        name: string,
        optionsOrCallback:
          | { callback?: () => void; onerror?: () => void }
          | (() => void),
      ) => void;
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

const GAPI_SCRIPT_URL = "https://apis.google.com/js/api.js";
const GAPI_READY_TIMEOUT_MS = 15_000;

function waitForGapi(
  timeoutMs = GAPI_READY_TIMEOUT_MS,
): Promise<NonNullable<Window["gapi"]>> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.gapi?.load) {
        window.clearInterval(timer);
        resolve(window.gapi);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error("Google API (gapi) の読み込みがタイムアウトしました。広告ブロック等でスクリプトが遮断されている可能性があります。"));
      }
    }, 50);
  });
}

function loadGapiScript(): Promise<void> {
  if (window.gapi?.load) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startWaiting = () => {
      void waitForGapi()
        .then(() => resolve())
        .catch(reject);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GAPI_SCRIPT_URL}"]`,
    );
    if (existing) {
      startWaiting();
      return;
    }

    const script = document.createElement("script");
    script.src = GAPI_SCRIPT_URL;
    script.async = true;
    script.onload = startWaiting;
    script.onerror = () =>
      reject(new Error("Google API スクリプトの読み込みに失敗しました"));
    document.body.appendChild(script);
  });
}

function loadPickerModule(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.gapi?.load) {
      reject(new Error("Google API (gapi) が未ロードです"));
      return;
    }

    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () =>
        reject(new Error("Google Picker API の読み込みに失敗しました")),
    });
  });
}

async function ensurePickerReady(): Promise<void> {
  await loadGapiScript();
  await waitForGapi();
  if (!window.google?.picker) {
    await loadPickerModule();
  }
}

export function GoogleDriveFolderPicker({
  disabled,
  onPick,
}: GoogleDriveFolderPickerProps) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pickerConfigQuery = api.googleDrive.getPickerConfig.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await ensurePickerReady();
        if (!cancelled) {
          setReady(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Picker の読み込みに失敗しました",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPicker = useCallback(async () => {
    setError(null);
    try {
      if (!ready) {
        await ensurePickerReady();
        setReady(true);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Picker の読み込みに失敗しました",
      );
      return;
    }

    const result = await pickerConfigQuery.refetch();
    const config = result.data;
    const picker = window.google?.picker;

    if (!config || !picker) {
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
        disabled={(disabled ?? false) || loading || pickerConfigQuery.isFetching}
        onClick={() => void openPicker()}
        className="rounded bg-blue-600 px-3 py-1 text-xs hover:bg-blue-500 disabled:opacity-50"
      >
        {loading || pickerConfigQuery.isFetching
          ? "準備中..."
          : "フォルダを選ぶ"}
      </button>
      {(error ?? pickerConfigQuery.error?.message) && (
        <p className="text-xs text-red-400">
          {error ?? pickerConfigQuery.error?.message}
        </p>
      )}
    </div>
  );
}
