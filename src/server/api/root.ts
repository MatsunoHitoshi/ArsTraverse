// import { postRouter } from "@/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { kgRouter } from "./routers/kg";
import { documentGraphRouter } from "./routers/document-graph";
import { sourceDocumentRouter } from "./routers/source-document";
import { topicSpaceRouter } from "./routers/topic-space";
import { treeGraphRouter } from "./routers/tree-graph";
import { assistantRouter } from "./routers/assistant";
import { topicSpaceChangeHistoryRouter } from "./routers/topic-space-change-history";
import { mcpRouter } from "./routers/mcp";
import { migrationRouter } from "./routers/migration/unify-graph-data";
import { graphEmbeddingRouter } from "./routers/graph-embedding";
import { workspaceRouter } from "./routers/workspace";
import { annotationRouter } from "./routers/annotation";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  // post: postRouter,
  kg: kgRouter,
  documentGraph: documentGraphRouter,
  sourceDocument: sourceDocumentRouter,
  topicSpaces: topicSpaceRouter,
  treeGraph: treeGraphRouter,
  assistant: assistantRouter,
  topicSpaceChangeHistory: topicSpaceChangeHistoryRouter,
  mcp: mcpRouter,
  migration: migrationRouter,
  graphEmbedding: graphEmbeddingRouter,
  workspace: workspaceRouter,
  annotation: annotationRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
