declare module "ngraph.leiden" {
  export function detectClusters(
    graph: unknown,
    options?: Record<string, unknown>,
  ): {
    getClass: (nodeId: string) => number;
    getCommunities: () => Map<number, string[]>;
    quality: () => number;
    toJSON: () => unknown;
  };
}
