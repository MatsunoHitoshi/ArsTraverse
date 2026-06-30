import type { Locale } from "i18n/routing";

export type McpMessageKey =
  | "authRequired"
  | "draftAuthRequired"
  | "topicSpaceIdMissing"
  | "topicSpaceNotFound"
  | "createSourceDocumentError"
  | "getSourceDocumentGraphError"
  | "getTopicSpaceGraphError"
  | "getDriveSyncStatusError"
  | "syncDriveFolderError"
  | "createTopicSpaceError"
  | "attachDocumentsError"
  | "detachDocumentError"
  | "getChangeHistoryError"
  | "getChangeHistoryDetailError"
  | "replayNodeMergesError"
  | "searchNoResults"
  | "searchError"
  | "relationNotFound"
  | "relationPredictFailed"
  | "relationFetchError"
  | "contextFetchError"
  | "referenceFetchError"
  | "listGraphError"
  | "findDuplicateNodesError"
  | "findExactDuplicateGroupsError"
  | "findDuplicateEdgesError"
  | "getLabelDistributionError"
  | "createDraftError"
  | "getDraftGraphError"
  | "getDraftDiffError"
  | "upsertNodeError"
  | "deleteNodeError"
  | "setNodePropertyError"
  | "unsetNodePropertyError"
  | "upsertEdgeError"
  | "deleteEdgeError"
  | "setEdgePropertyError"
  | "unsetEdgePropertyError"
  | "mergeNodesError"
  | "deduplicateEdgesError"
  | "submitProposalError"
  | "embeddingAuthRequired"
  | "embeddingUrlMissing"
  | "searchResultsHeader"
  | "noRelatedInfo"
  | "draftCreated"
  | "nodeApplied"
  | "nodeDeleted"
  | "nodePropertySet"
  | "nodePropertyUnset"
  | "edgeApplied"
  | "edgeDeleted"
  | "edgePropertySet"
  | "edgePropertyUnset";

const JA: Record<McpMessageKey, string> = {
  authRequired:
    "この操作には認証が必要です。/mcp/authorize でトークンを発行するか、Authorization: Bearer ヘッダーを設定してください。",
  draftAuthRequired:
    "この操作にはログインが必要です。ブラウザでログインした状態で接続するか、User-Authorization ヘッダーを設定してください。",
  topicSpaceIdMissing: "Topic Space ID is missing",
  topicSpaceNotFound: "Topic space not found",
  createSourceDocumentError: "SourceDocument の作成中にエラーが発生しました。",
  getSourceDocumentGraphError:
    "SourceDocument グラフの取得中にエラーが発生しました。",
  getTopicSpaceGraphError: "TopicSpace グラフの取得中にエラーが発生しました。",
  getDriveSyncStatusError: "Drive 同期状態の取得中にエラーが発生しました。",
  syncDriveFolderError: "Drive 同期の実行中にエラーが発生しました。",
  createTopicSpaceError: "TopicSpace の作成中にエラーが発生しました。",
  attachDocumentsError:
    "SourceDocument の TopicSpace への追加中にエラーが発生しました。",
  detachDocumentError:
    "SourceDocument の TopicSpace からの切り離し中にエラーが発生しました。",
  getChangeHistoryError:
    "TopicSpace 変更履歴の取得中にエラーが発生しました。",
  getChangeHistoryDetailError: "変更履歴詳細の取得中にエラーが発生しました。",
  replayNodeMergesError: "ノード統合の再適用中にエラーが発生しました。",
  searchNoResults: "に一致する情報は見つかりませんでした。",
  searchError: "検索中にエラーが発生しました。",
  relationNotFound: "の関係性が見つかりませんでしたが、このノード間には下記の関係性が予測されました",
  relationPredictFailed: "推論データの取得に失敗しました。",
  relationFetchError: "関係性の取得中にエラーが発生しました。",
  contextFetchError: "解説の取得中にエラーが発生しました。",
  referenceFetchError: "言及場所の取得中にエラーが発生しました。",
  listGraphError: "グラフ一覧の取得中にエラーが発生しました。",
  findDuplicateNodesError: "重複候補の検索中にエラーが発生しました。",
  findExactDuplicateGroupsError:
    "完全一致重複グループの検出中にエラーが発生しました。",
  findDuplicateEdgesError: "重複エッジグループの検出中にエラーが発生しました。",
  getLabelDistributionError: "ラベル分布の取得中にエラーが発生しました。",
  createDraftError: "ドラフト提案の作成に失敗しました。",
  getDraftGraphError: "ドラフト状態の取得に失敗しました。",
  getDraftDiffError: "変更提案の差分取得中にエラーが発生しました。",
  upsertNodeError: "ノードの反映に失敗しました。",
  deleteNodeError: "ノード削除に失敗しました。",
  setNodePropertyError: "ノードpropertyの設定に失敗しました。",
  unsetNodePropertyError: "ノードpropertyの削除に失敗しました。",
  upsertEdgeError: "エッジの反映に失敗しました。",
  deleteEdgeError: "エッジ削除に失敗しました。",
  setEdgePropertyError: "エッジpropertyの設定に失敗しました。",
  unsetEdgePropertyError: "エッジpropertyの削除に失敗しました。",
  mergeNodesError: "ノード統合の反映に失敗しました。",
  deduplicateEdgesError: "重複エッジの削除に失敗しました。",
  submitProposalError: "変更提案の提出に失敗しました。",
  embeddingAuthRequired:
    "User-Authorization ヘッダーまたはブラウザログインが必要です。",
  embeddingUrlMissing:
    "NEXT_PUBLIC_SUPABASE_URL が未設定のため embedding 検索をスキップしました。",
  searchResultsHeader:
    "以下の情報とそれぞれの関連情報が見つかりました。さらに詳しい関係性や具体的な言及箇所を知りたい場合は、ノードのIDをもとにそれぞれのツールを利用してください。",
  noRelatedInfo: "関連情報はありません。",
  draftCreated: "下書きの変更提案を作成しました。proposalId=",
  nodeApplied: "ノードをドラフトに反映しました。nodeId=",
  nodeDeleted: "ノードを削除しました。nodeId=",
  nodePropertySet: "ノードpropertyを設定しました。nodeId=",
  nodePropertyUnset: "ノードpropertyを削除しました。nodeId=",
  edgeApplied: "エッジをドラフトに反映しました。edgeId=",
  edgeDeleted: "エッジを削除しました。edgeId=",
  edgePropertySet: "エッジpropertyを設定しました。edgeId=",
  edgePropertyUnset: "エッジpropertyを削除しました。edgeId=",
};

const EN: Record<McpMessageKey, string> = {
  authRequired:
    "Authentication is required for this operation. Issue a token at /mcp/authorize or set the Authorization: Bearer header.",
  draftAuthRequired:
    "Login is required for this operation. Connect while logged in via the browser or set the User-Authorization header.",
  topicSpaceIdMissing: "Topic Space ID is missing",
  topicSpaceNotFound: "Topic space not found",
  createSourceDocumentError:
    "An error occurred while creating the SourceDocument.",
  getSourceDocumentGraphError:
    "An error occurred while fetching the SourceDocument graph.",
  getTopicSpaceGraphError:
    "An error occurred while fetching the TopicSpace graph.",
  getDriveSyncStatusError:
    "An error occurred while fetching Drive sync status.",
  syncDriveFolderError: "An error occurred while syncing the Drive folder.",
  createTopicSpaceError: "An error occurred while creating the TopicSpace.",
  attachDocumentsError:
    "An error occurred while attaching SourceDocuments to the TopicSpace.",
  detachDocumentError:
    "An error occurred while detaching the SourceDocument from the TopicSpace.",
  getChangeHistoryError:
    "An error occurred while fetching TopicSpace change history.",
  getChangeHistoryDetailError:
    "An error occurred while fetching change history details.",
  replayNodeMergesError:
    "An error occurred while replaying node merges.",
  searchNoResults: "No matching information was found for ",
  searchError: "An error occurred during search.",
  relationNotFound:
    "No direct relationship was found between {start} and {end}, but the following relationships were predicted",
  relationPredictFailed: "Failed to fetch inference data.",
  relationFetchError: "An error occurred while fetching the relationship.",
  contextFetchError: "An error occurred while fetching the explanation.",
  referenceFetchError: "An error occurred while fetching mention locations.",
  listGraphError: "An error occurred while listing the graph.",
  findDuplicateNodesError:
    "An error occurred while searching for duplicate node candidates.",
  findExactDuplicateGroupsError:
    "An error occurred while detecting exact duplicate node groups.",
  findDuplicateEdgesError:
    "An error occurred while detecting duplicate edge groups.",
  getLabelDistributionError:
    "An error occurred while fetching label distribution.",
  createDraftError: "Failed to create draft proposal.",
  getDraftGraphError: "Failed to fetch draft state.",
  getDraftDiffError:
    "An error occurred while fetching the change proposal diff.",
  upsertNodeError: "Failed to apply node to draft.",
  deleteNodeError: "Failed to delete node.",
  setNodePropertyError: "Failed to set node property.",
  unsetNodePropertyError: "Failed to unset node property.",
  upsertEdgeError: "Failed to apply edge to draft.",
  deleteEdgeError: "Failed to delete edge.",
  setEdgePropertyError: "Failed to set edge property.",
  unsetEdgePropertyError: "Failed to unset edge property.",
  mergeNodesError: "Failed to apply node merge to draft.",
  deduplicateEdgesError: "Failed to remove duplicate edges.",
  submitProposalError: "Failed to submit change proposal.",
  embeddingAuthRequired:
    "User-Authorization header or browser login is required.",
  embeddingUrlMissing:
    "Embedding search was skipped because NEXT_PUBLIC_SUPABASE_URL is not set.",
  searchResultsHeader:
    "The following information and related details were found. To learn more about relationships or specific mentions, use the tools with each node's ID.",
  noRelatedInfo: "No related information.",
  draftCreated: "Created draft change proposal. proposalId=",
  nodeApplied: "Applied node to draft. nodeId=",
  nodeDeleted: "Deleted node. nodeId=",
  nodePropertySet: "Set node property. nodeId=",
  nodePropertyUnset: "Removed node property. nodeId=",
  edgeApplied: "Applied edge to draft. edgeId=",
  edgeDeleted: "Deleted edge. edgeId=",
  edgePropertySet: "Set edge property. edgeId=",
  edgePropertyUnset: "Removed edge property. edgeId=",
};

export function getMcpMessage(
  locale: Locale,
  key: McpMessageKey,
  params?: Record<string, string>,
): string {
  const template = locale === "en" ? EN[key] : JA[key];
  if (!params) return template;
  return Object.entries(params).reduce(
    (msg, [k, v]) => msg.replaceAll(`{${k}}`, v),
    template,
  );
}
