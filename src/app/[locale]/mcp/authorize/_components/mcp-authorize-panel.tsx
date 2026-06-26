"use client";

import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Locale } from "i18n/routing";
import { issueMcpAccessToken } from "../actions";
import {
  PLATFORM_MCP_SCOPE,
  resolveInitialScopeSelection,
  type IssueMcpTokenResult,
} from "../types";

type TopicSpaceOption = {
  id: string;
  name: string;
};

type Props = {
  isLoggedIn: boolean;
  userName: string | null;
  userEmail: string | null;
  initialClientName: string;
  initialTopicSpaceId: string;
  topicSpaces: TopicSpaceOption[];
  callbackUrl: string;
};

export function McpAuthorizePanel({
  isLoggedIn,
  userName,
  userEmail,
  initialClientName,
  initialTopicSpaceId,
  topicSpaces,
  callbackUrl,
}: Props) {
  const t = useTranslations("mcpAuthorize");
  const locale = useLocale() as Locale;
  const [clientName, setClientName] = useState(initialClientName);
  const [scopeSelection, setScopeSelection] = useState(() =>
    resolveInitialScopeSelection(
      initialTopicSpaceId,
      topicSpaces.map((space) => space.id),
    ),
  );
  const [result, setResult] = useState<IssueMcpTokenResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800/80 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white">{t("authTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {t("authDescription")}
        </p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-6 w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-100"
        >
          {t("signInWithGoogle")}
        </button>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="w-full max-w-2xl rounded-xl border border-emerald-800/60 bg-slate-800/80 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-emerald-300">
          {t("tokenIssuedTitle")}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          {t("clientLabel")}:{" "}
          <span className="text-white">{result.clientName}</span>
          <br />
          {t("scopeLabel")}:{" "}
          <span className="text-white">
            {result.scope === "platform"
              ? t("scopePlatform")
              : t("scopeRepository")}
          </span>
          <br />
          {t("expiresAtLabel")}:{" "}
          <span className="text-white">
            {new Date(result.expiresAt).toLocaleString(
              locale === "ja" ? "ja-JP" : "en-US",
            )}
          </span>
        </p>

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          {t("accessTokenLabel")}
        </label>
        <CopyBlock value={result.token} />

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          {t("platformMcpUrlLabel")}
        </label>
        <CopyBlock value={result.platformMcpUrl} />

        {result.mcpUrl ? (
          <>
            <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("repositoryMcpUrlLabel")}
            </label>
            <CopyBlock value={result.mcpUrl} />
          </>
        ) : null}

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          {t("cursorConfigLabel")}
        </label>
        <CopyBlock value={result.cursorConfigJson} mono />

        <p className="mt-6 text-xs leading-relaxed text-slate-400">
          {t("tokenSecurityNote")}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800/80 p-8 shadow-xl">
      <h1 className="text-xl font-semibold text-white">{t("authorizeTitle")}</h1>
      <p className="mt-2 text-sm text-slate-300">
        {t("loggedInAs", {
          name: userName ?? userEmail ?? t("defaultUser"),
        })}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-slate-400">
        {t("authorizeDescription")}
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const issued = await issueMcpAccessToken({
              clientName,
              topicSpaceId: scopeSelection,
            });
            setResult(issued);
          });
        }}
      >
        <div>
          <label
            htmlFor="client-name"
            className="block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            {t("clientNameLabel")}
          </label>
          <input
            id="client-name"
            type="text"
            required
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            placeholder={t("clientNamePlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <label
            htmlFor="mcp-scope"
            className="block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            {t("accessScopeLabel")}
          </label>
          <select
            id="mcp-scope"
            required
            value={scopeSelection}
            onChange={(event) => setScopeSelection(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value={PLATFORM_MCP_SCOPE}>{t("scopePlatformOption")}</option>
            {topicSpaces.map((space) => (
              <option key={space.id} value={space.id}>
                {t("repositoryOption", { name: space.name })}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {t("scopeHint")}
          </p>
        </div>

        {result && !result.ok && (
          <p className="text-sm text-red-400">{result.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? t("issuing") : t("issueToken")}
        </button>
      </form>
    </div>
  );
}

function CopyBlock({
  value,
  mono = false,
}: {
  value: string;
  mono?: boolean;
}) {
  const t = useTranslations("mcpAuthorize");
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-2 flex gap-2">
      <pre
        className={`max-h-48 flex-1 overflow-auto rounded-lg border border-slate-600 bg-slate-950 p-3 text-xs text-slate-200 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="h-fit shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
      >
        {copied ? t("copied") : t("copy")}
      </button>
    </div>
  );
}
