import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { CreateFromScanInputSchema } from "@/server/api/schemas/scan";
import { createFromScan } from "@/server/services/scan/create-from-scan.service";

export const scanRouter = createTRPCRouter({
  createFromScan: protectedProcedure
    .input(CreateFromScanInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createFromScan(ctx, input);
    }),
});
