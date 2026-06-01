import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { CreateFromScanInputSchema } from "@/server/api/schemas/scan";
import { createFromScan } from "@/server/services/scan/create-from-scan.service";
import { listScanSessions } from "@/server/services/scan/list-scan-sessions.service";
import { getScanSession } from "@/server/services/scan/get-scan-session.service";

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
});
