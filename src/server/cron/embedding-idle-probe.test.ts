import { describe, expect, it } from "vitest";
import {
  buildNodeNameEmbeddingProbeUrl,
  buildTransEEmbeddingProbeUrl,
  interpretProbeRows,
} from "./embedding-idle-probe";

const SUPABASE_URL = "https://example.supabase.co";

describe("embedding idle probe URLs", () => {
  it("checks only for a GraphNode whose nameEmbedding is null", () => {
    const url = new URL(buildNodeNameEmbeddingProbeUrl(SUPABASE_URL));
    expect(url.pathname).toBe("/rest/v1/GraphNode");
    expect(url.searchParams.get("select")).toBe("id");
    expect(url.searchParams.get("nameEmbedding")).toBe("is.null");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("keeps PostgREST in.() syntax unencoded for pending or processing jobs", () => {
    const url = buildTransEEmbeddingProbeUrl(SUPABASE_URL);
    expect(url).toBe(
      "https://example.supabase.co/rest/v1/GraphEmbeddingQueue?select=id&status=in.(PENDING,PROCESSING)&limit=1",
    );
  });
});

describe("interpretProbeRows", () => {
  it("treats an empty array as idle and any row as work", () => {
    expect(interpretProbeRows([])).toBe("idle");
    expect(interpretProbeRows([{ id: "job_1" }])).toBe("work");
  });

  it("fails open when the body is not a row array", () => {
    expect(interpretProbeRows(null)).toBe("unknown");
    expect(interpretProbeRows({ message: "error" })).toBe("unknown");
  });
});
