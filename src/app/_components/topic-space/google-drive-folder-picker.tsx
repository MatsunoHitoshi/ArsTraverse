"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";

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

type PickerErrorKey =
  | "gapiTimeout"
  | "gapiScriptLoadFailed"
  | "gapiNotLoaded"
  | "pickerApiLoadFailed"
  | "pickerLoadFailed"
  | "pickerNotReady";

class PickerLoadError extends Error {
  constructor(public readonly messageKey: PickerErrorKey) {
    super(messageKey);
    this.name = "PickerLoadError";
  }
}

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
        reject(new PickerLoadError("gapiTimeout"));
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
    script.onerror = () => reject(new PickerLoadError("gapiScriptLoadFailed"));
    document.body.appendChild(script);
  });
}

function loadPickerModule(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.gapi?.load) {
      reject(new PickerLoadError("gapiNotLoaded"));
      return;
    }

    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new PickerLoadError("pickerApiLoadFailed")),
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

function getPickerErrorMessage(
  error: unknown,
  t: (key: PickerErrorKey) => string,
): string {
  if (error instanceof PickerLoadError) {
    return t(error.messageKey);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return t("pickerLoadFailed");
}

export function GoogleDriveFolderPicker({
  disabled,
  onPick,
}: GoogleDriveFolderPickerProps) {
  const t = useTranslations("topicSpace");
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
          setError(getPickerErrorMessage(loadError, t));
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
  }, [t]);

  const openPicker = useCallback(async () => {
    setError(null);
    try {
      if (!ready) {
        await ensurePickerReady();
        setReady(true);
      }
    } catch (loadError) {
      setError(getPickerErrorMessage(loadError, t));
      return;
    }

    const result = await pickerConfigQuery.refetch();
    const config = result.data;
    const picker = window.google?.picker;

    if (!config || !picker) {
      setError(t("pickerNotReady"));
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
      .setTitle(t("pickerTitle"))
      .setCallback((data: PickerResponse) => {
        if (data.action !== picker.Action.PICKED || !data.docs?.[0]) return;
        const doc = data.docs[0];
        onPick({ id: doc.id, name: doc.name });
      })
      .build();

    pickerInstance.setVisible(true);
  }, [onPick, pickerConfigQuery, ready, t]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={(disabled ?? false) || loading || pickerConfigQuery.isFetching}
        onClick={() => void openPicker()}
        className="rounded bg-blue-600 px-3 py-1 text-xs hover:bg-blue-500 disabled:opacity-50"
      >
        {loading || pickerConfigQuery.isFetching
          ? t("preparing")
          : t("pickFolder")}
      </button>
      {(error ?? pickerConfigQuery.error?.message) && (
        <p className="text-xs text-red-400">
          {error ?? pickerConfigQuery.error?.message}
        </p>
      )}
    </div>
  );
}
