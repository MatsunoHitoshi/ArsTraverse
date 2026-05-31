import type { PublishedNodeMatch } from "@/server/api/schemas/scan";
import Link from "next/link";

type PublishedNodeMatchesProps = {
  matches: PublishedNodeMatch[];
  title?: string;
  emptyMessage?: string;
};

export function PublishedNodeMatches({
  matches,
  title = "公開グラフとの一致候補",
  emptyMessage = "一致する公開ノードは見つかりませんでした",
}: PublishedNodeMatchesProps) {
  if (matches.length === 0) {
    return (
      <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">{title}</h2>
        <p className="text-sm text-slate-400">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">{title}</h2>
      <ul className="flex flex-col gap-3">
        {matches.map((match) => (
          <li
            key={`${match.nodeId}-${match.workspaceId}`}
            className="rounded-lg border border-slate-700 bg-slate-900/50 p-3"
          >
            <div className="mb-1 text-base font-medium text-orange-300">
              {match.name}
            </div>
            <div className="mb-2 text-xs text-slate-400">
              {match.label} · {match.topicSpaceName}
            </div>
            <Link
              href={`/workspaces/${match.workspaceId}`}
              className="text-sm text-sky-400 underline-offset-2 hover:underline"
            >
              {match.workspaceName} を開く
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
