"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
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
        <h1 className="text-xl font-semibold text-white">MCP 連携の認証</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          外部クライアントから ArsTraverse
          の MCP を利用するには、まず Google アカウントでログインしてください。
        </p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-6 w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-100"
        >
          Google でログイン
        </button>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="w-full max-w-2xl rounded-xl border border-emerald-800/60 bg-slate-800/80 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-emerald-300">
          MCP アクセストークンを発行しました
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          クライアント: <span className="text-white">{result.clientName}</span>
          <br />
          スコープ:{" "}
          <span className="text-white">
            {result.scope === "platform"
              ? "プラットフォーム（ドキュメント・TopicSpace 作成）"
              : "TopicSpace（検索・グラフ編集）"}
          </span>
          <br />
          有効期限:{" "}
          <span className="text-white">
            {new Date(result.expiresAt).toLocaleString("ja-JP")}
          </span>
        </p>

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          アクセストークン（Bearer）
        </label>
        <CopyBlock value={result.token} />

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          プラットフォーム MCP URL
        </label>
        <CopyBlock value={result.platformMcpUrl} />

        {result.mcpUrl ? (
          <>
            <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
              TopicSpace MCP URL
            </label>
            <CopyBlock value={result.mcpUrl} />
          </>
        ) : null}

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Cursor MCP 設定（mcp.json）
        </label>
        <CopyBlock value={result.cursorConfigJson} mono />

        <p className="mt-6 text-xs leading-relaxed text-slate-400">
          トークンはこの画面でのみ表示されます。安全な場所に保存してください。Cursor
          を再起動すると MCP ツールが利用可能になります。
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800/80 p-8 shadow-xl">
      <h1 className="text-xl font-semibold text-white">MCP 連携の許可</h1>
      <p className="mt-2 text-sm text-slate-300">
        ログイン中: {userName ?? userEmail ?? "ユーザー"}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-slate-400">
        外部クライアントに MCP
        ツールへのアクセスを許可します。
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
            クライアント名
          </label>
          <input
            id="client-name"
            type="text"
            required
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            placeholder="クライアント名を入力してください"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <label
            htmlFor="mcp-scope"
            className="block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            アクセス範囲
          </label>
          <select
            id="mcp-scope"
            required
            value={scopeSelection}
            onChange={(event) => setScopeSelection(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value={PLATFORM_MCP_SCOPE}>
              プラットフォーム（ドキュメント取り込み・TopicSpace 新規作成）
            </option>
            {topicSpaces.map((space) => (
              <option key={space.id} value={space.id}>
                TopicSpace: {space.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            初回取り込みでは「プラットフォーム」を選び、TopicSpace
            作成後に TopicSpace を含むトークンを再発行してください。
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
          {isPending ? "発行中…" : "アクセスを許可してトークンを発行"}
        </button>
      </form>
    </div>
  );
}

function CopyBlock({ value, mono = false }: { value: string; mono?: boolean }) {
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
        {copied ? "コピー済" : "コピー"}
      </button>
    </div>
  );
}
