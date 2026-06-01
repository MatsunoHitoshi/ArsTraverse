import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  CreateFromScanInputSchema,
  NormalizeOcrTextInputSchema,
  RenameScanSessionInputSchema,
  SearchNodeMatchesByNamesInputSchema,
} from "@/server/api/schemas/scan";
import { createFromScan } from "@/server/services/scan/create-from-scan.service";
import { listScanSessions } from "@/server/services/scan/list-scan-sessions.service";
import { getScanSession } from "@/server/services/scan/get-scan-session.service";
import { deleteScanSession } from "@/server/services/scan/delete-scan-session.service";
import { renameScanSession } from "@/server/services/scan/rename-scan-session.service";
import { normalizeOcrTextWithLlm } from "@/server/services/scan/normalize-ocr-text.service";
import { searchUserScanNodeMatchesByNames } from "@/server/services/scan/search-user-scan-node-matches.service";
import { searchPublishedNodesByNames } from "@/server/services/workspace/search-published-nodes.service";

type RenameSessionInput = z.infer<typeof RenameScanSessionInputSchema>;
type SearchNodeMatchesByNamesInput = z.infer<
  typeof SearchNodeMatchesByNamesInputSchema
>;

export const scanRouter = createTRPCRouter({
  createFromScan: protectedProcedure
    .input(CreateFromScanInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createFromScan(ctx, input);
    }),

  listSessions: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(30),
          page: z.number().int().min(1).default(1),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return listScanSessions(ctx, {
        limit: input?.limit ?? 30,
        page: input?.page ?? 1,
      });
    }),

  getSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getScanSession(ctx, input.id);
    }),

  deleteSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return deleteScanSession(ctx, input.id);
    }),

  renameSession: protectedProcedure
    .input(RenameScanSessionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const validated: RenameSessionInput = RenameScanSessionInputSchema.parse(input);
      return renameScanSession(ctx, validated.id, validated.name);
    }),

  normalizeOcrText: protectedProcedure
    .input(NormalizeOcrTextInputSchema)
    .mutation(async ({ input }) => {
      return normalizeOcrTextWithLlm(input);
    }),

  searchNodeMatchesByNames: protectedProcedure
    .input(SearchNodeMatchesByNamesInputSchema)
    .query(async ({ ctx, input }) => {
      const validated: SearchNodeMatchesByNamesInput =
        SearchNodeMatchesByNamesInputSchema.parse(input);
      const limit = validated.limit;
      const publishedMatches = await searchPublishedNodesByNames(
        ctx,
        validated.nodeNames,
        limit,
      );
      const sourceDocumentMatches = await searchUserScanNodeMatchesByNames(
        ctx,
        validated.nodeNames,
        validated.excludeSourceDocumentId,
        limit,
      );
      return [...publishedMatches, ...sourceDocumentMatches];
    }),
});
