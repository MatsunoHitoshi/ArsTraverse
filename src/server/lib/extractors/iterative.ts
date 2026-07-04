import type {
  Extractor,
  ExtractorOptions,
  NodesAndRelationships,
} from "./base";
import { IterativeGraphExtractorCore } from "./iterative-core";

export { IterativeGraphExtractorCore } from "./iterative-core";

export class IterativeGraphExtractor
  extends IterativeGraphExtractorCore
  implements Extractor
{
  async extract(
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships | null> {
    const { localFilePath, isPlaneTextMode } = options;

    try {
      console.log(
        `Starting Iterative Extraction (Enhanced with LangChain) for file: ${localFilePath}`,
      );

      const { textInspect } = await import("@/app/_utils/text/text-inspector");
      const documents = await textInspect(localFilePath, isPlaneTextMode);
      console.log(`Loaded ${documents.length} document chunks.`);

      const phase1Data = await this.extractPhase1(documents, options);
      if (!phase1Data) return null;

      const phase2Data = await this.extractPhase2(
        documents,
        phase1Data.nodes,
        options,
      );
      if (!phase2Data) return phase1Data;

      return this.mergeResults(phase1Data, phase2Data);
    } catch (error) {
      console.error("Iterative extraction failed:", error);
      throw error;
    }
  }
}
