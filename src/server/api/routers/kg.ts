import { createTRPCRouter } from "../trpc";
import { extractionProcedures } from "./kg-extraction";
import { integrationProcedures } from "./kg-integration";
import { copilotProcedures } from "./kg-copilot";

export const kgRouter = createTRPCRouter({
  ...extractionProcedures,
  ...integrationProcedures,
  ...copilotProcedures,
});
