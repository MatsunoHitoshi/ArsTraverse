export type { GraphChangeData } from "./types";
export {
  mapFrontendNodeToPrisma,
  mapFrontendRelationshipToPrisma,
  mapFrontendGraphToPrismaGraph,
  buildRelationshipCreateRowsFromIdMap,
} from "./graph-format";
export { buildGraphEditChangeRows } from "./proposal-change-rows";
export {
  buildNodeLinkChangeHistoryRows,
  type NodeLinkChangeHistoryRow,
} from "./graph-history";
export {
  generateGraphChangeData,
  graphChangeDataFromDiffs,
  generateProposalChangeData,
} from "./graph-change-data";
export type { GraphScope } from "./graph-scope";
export {
  topicSpaceScope,
  documentGraphScope,
} from "./graph-scope";
export {
  applyGraphChanges,
  applyScopedGraphChanges,
  applyScopedGraphChangesToDb,
} from "./graph-mutation";
export { rollbackNodeLinkChanges } from "./graph-rollback";
