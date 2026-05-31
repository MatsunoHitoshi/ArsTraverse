import type { GraphDocumentForFrontend } from "@/app/const/types";

type GraphSummaryProps = {
  graph: GraphDocumentForFrontend;
};

export function GraphSummary({ graph }: GraphSummaryProps) {
  const nodesMap = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">抽出グラフ</h2>
        <span className="text-xs text-slate-400">
          ノード {graph.nodes.length} · 関係 {graph.relationships.length}
        </span>
      </div>

      {graph.nodes.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            ノード
          </h3>
          <ul className="flex flex-wrap gap-2">
            {graph.nodes.map((node) => (
              <li
                key={node.id}
                className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-sm text-slate-100"
              >
                {node.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {graph.relationships.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            関係
          </h3>
          <ul className="flex flex-col gap-2">
            {graph.relationships.map((relationship) => {
              const source = nodesMap.get(relationship.sourceId);
              const target = nodesMap.get(relationship.targetId);
              return (
                <li
                  key={relationship.id}
                  className="rounded-lg bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
                >
                  {source?.name ?? "?"} → {target?.name ?? "?"}
                  {relationship.type ? (
                    <span className="ml-2 text-xs text-slate-400">
                      ({relationship.type})
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
