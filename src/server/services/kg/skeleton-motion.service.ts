import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import {
  OMNICONTROL_OUTPUT_FRAMES,
  floodFramesFromLatentTokens,
  floodLatentTokensFromFrames,
  type FloodDiffusionMeta,
  type FloodDiffusionMotionResponse,
  type FloodDiffusionSegmentInput,
  type MotionComparisonCacheGroup,
  type SkeletonMotionCacheEntrySummary,
} from "@/app/const/skeleton-motion";

type SpatialControl = {
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  controlJoint: "pelvis" | "left_foot" | "right_foot";
};

type SkeletonMotionModel = "momask" | "omnicontrol" | "flooddiffusion";

export type GenerateSkeletonMotionInput = {
  topicSpaceId: string;
  edgeId: string;
  text: string;
  numFrames?: number;
  model?: SkeletonMotionModel;
  spatialControl?: SpatialControl;
  seed?: number;
  forceRegenerate?: boolean;
};

export type SkeletonMotionResult = {
  fps: number;
  jointNames: string[];
  boneConnections: [number, number][];
  frames: [number, number][][];
  metrics?: {
    footSkatingRatio: number;
    jointJitter: number;
    trajectoryAdherence?: number;
    totalFrames: number;
  };
  model: string;
  floodMeta?: FloodDiffusionMeta;
};

export type GenerateFloodDiffusionInput = {
  topicSpaceId: string;
  edgeId: string;
  mode: "single" | "streaming";
  text?: string;
  length?: number;
  segments?: FloodDiffusionSegmentInput[];
  numDenoiseSteps?: number;
  smoothingAlpha?: number;
  seed?: number;
  forceRegenerate?: boolean;
};

function cacheFrameCount(
  model: SkeletonMotionModel,
  numFrames: number,
): number {
  if (model === "omnicontrol") return OMNICONTROL_OUTPUT_FRAMES;
  if (model === "flooddiffusion") {
    return floodLatentTokensFromFrames(numFrames) * 4;
  }
  return numFrames;
}

function computePromptHash(text: string, numFrames: number): string {
  return createHash("sha256")
    .update(`${text}::${numFrames}`)
    .digest("hex")
    .slice(0, 16);
}

function computeFloodPromptHash(
  mode: "single" | "streaming",
  payload: {
    text?: string;
    length?: number;
    segments?: FloodDiffusionSegmentInput[];
  },
): string {
  if (mode === "streaming" && payload.segments) {
    const segmentKey = payload.segments
      .map((s) => `${s.text}@${s.endToken}`)
      .join("|");
    const total = payload.segments[payload.segments.length - 1]?.endToken ?? 0;
    return createHash("sha256")
      .update(`${segmentKey}::${total}::streaming`)
      .digest("hex")
      .slice(0, 16);
  }
  const length = payload.length ?? floodLatentTokensFromFrames(60);
  return createHash("sha256")
    .update(`${payload.text ?? ""}::${length}::single`)
    .digest("hex")
    .slice(0, 16);
}

function formatStreamingPromptText(segments: FloodDiffusionSegmentInput[]): string {
  return `[streaming] ${segments.map((s) => s.text).join(" → ")}`;
}

function getModalEndpointUrl(): string {
  const url = process.env.MODAL_ENDPOINT_URL;
  if (!url) {
    throw new Error(
      "MODAL_ENDPOINT_URL is not configured. Set it in .env.local for development (use `modal serve`) or in production environment variables.",
    );
  }
  return url;
}

function getFloodModalEndpointUrl(): string {
  const url = process.env.MODAL_FLOODDIFFUSION_URL;
  if (!url) {
    throw new Error(
      "MODAL_FLOODDIFFUSION_URL is not configured. Deploy gpu-worker/modal_flooddiffusion_app.py and set the endpoint URL.",
    );
  }
  return url;
}

async function callModalApi(
  input: GenerateSkeletonMotionInput,
): Promise<SkeletonMotionResult> {
  const baseUrl = getModalEndpointUrl();

  const body = {
    text: input.text,
    numFrames: input.numFrames ?? 24,
    model: input.model ?? (process.env.T2M_MODEL ?? "momask"),
    spatialControl: input.spatialControl ?? null,
    seed: input.seed ?? null,
  };

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(
      `Modal API error (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as SkeletonMotionResult;
}

async function callFloodModalApi(
  input: GenerateFloodDiffusionInput,
): Promise<FloodDiffusionMotionResponse> {
  const baseUrl = getFloodModalEndpointUrl();

  const body = {
    mode: input.mode,
    text: input.text ?? null,
    length: input.length ?? floodLatentTokensFromFrames(60),
    segments: input.segments ?? null,
    numDenoiseSteps: input.numDenoiseSteps ?? null,
    smoothingAlpha: input.smoothingAlpha ?? 0.5,
    seed: input.seed ?? null,
  };

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(
      `FloodDiffusion Modal API error (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as FloodDiffusionMotionResponse;
}

async function persistSkeletonMotionCache(
  db: PrismaClient,
  params: {
    edgeId: string;
    topicSpaceId: string;
    promptHash: string;
    promptText: string;
    numFrames: number | null;
    model: string;
    result: SkeletonMotionResult;
  },
): Promise<void> {
  const { metrics, floodMeta, ...skeletonData } = params.result;
  const jsonPayload = {
    ...skeletonData,
    ...(floodMeta ? { floodMeta } : {}),
  };

  await db.skeletonMotionCache.upsert({
    where: {
      edgeId_topicSpaceId_promptHash_model: {
        edgeId: params.edgeId,
        topicSpaceId: params.topicSpaceId,
        promptHash: params.promptHash,
        model: params.model,
      },
    },
    create: {
      edgeId: params.edgeId,
      topicSpaceId: params.topicSpaceId,
      promptHash: params.promptHash,
      promptText: params.promptText,
      numFrames: params.numFrames,
      model: params.model,
      skeletonJson: jsonPayload as Prisma.InputJsonValue,
      metrics: (metrics as Prisma.InputJsonValue) ?? undefined,
    },
    update: {
      promptText: params.promptText,
      numFrames: params.numFrames,
      skeletonJson: jsonPayload as Prisma.InputJsonValue,
      metrics: (metrics as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function generateSkeletonMotion(
  db: PrismaClient,
  input: GenerateSkeletonMotionInput,
): Promise<SkeletonMotionResult> {
  const model =
    input.model ??
    (process.env.T2M_MODEL as SkeletonMotionModel | undefined) ??
    "momask";
  const numFrames = input.numFrames ?? 24;
  const promptHash = computePromptHash(
    input.text,
    cacheFrameCount(model, numFrames),
  );

  if (!input.forceRegenerate) {
    const cached = await db.skeletonMotionCache.findUnique({
      where: {
        edgeId_topicSpaceId_promptHash_model: {
          edgeId: input.edgeId,
          topicSpaceId: input.topicSpaceId,
          promptHash,
          model,
        },
      },
    });

    if (cached) {
      const json = cached.skeletonJson as unknown as SkeletonMotionResult;
      return {
        ...json,
        metrics:
          (cached.metrics as SkeletonMotionResult["metrics"]) ?? undefined,
        model,
      };
    }
  }

  const result = await callModalApi({ ...input, model, numFrames });

  await persistSkeletonMotionCache(db, {
    edgeId: input.edgeId,
    topicSpaceId: input.topicSpaceId,
    promptHash,
    promptText: input.text,
    numFrames: cacheFrameCount(model, numFrames),
    model,
    result,
  });

  return result;
}

export async function generateFloodDiffusion(
  db: PrismaClient,
  input: GenerateFloodDiffusionInput,
): Promise<FloodDiffusionMotionResponse> {
  const promptHash = computeFloodPromptHash(input.mode, {
    text: input.text,
    length: input.length,
    segments: input.segments,
  });

  const promptText =
    input.mode === "streaming" && input.segments
      ? formatStreamingPromptText(input.segments)
      : (input.text ?? "");

  const numFrames =
    input.mode === "streaming" && input.segments
      ? floodFramesFromLatentTokens(
          input.segments[input.segments.length - 1]?.endToken ?? 0,
        )
      : floodFramesFromLatentTokens(input.length ?? floodLatentTokensFromFrames(60));

  if (!input.forceRegenerate) {
    const cached = await db.skeletonMotionCache.findUnique({
      where: {
        edgeId_topicSpaceId_promptHash_model: {
          edgeId: input.edgeId,
          topicSpaceId: input.topicSpaceId,
          promptHash,
          model: "flooddiffusion",
        },
      },
    });

    if (cached) {
      const json = cached.skeletonJson as unknown as FloodDiffusionMotionResponse;
      return {
        ...json,
        metrics:
          (cached.metrics as FloodDiffusionMotionResponse["metrics"]) ??
          undefined,
        model: "flooddiffusion",
        floodMeta: json.floodMeta,
      };
    }
  }

  const result = await callFloodModalApi(input);

  await persistSkeletonMotionCache(db, {
    edgeId: input.edgeId,
    topicSpaceId: input.topicSpaceId,
    promptHash,
    promptText,
    numFrames,
    model: "flooddiffusion",
    result,
  });

  return result;
}

export type GenerateMotionComparisonInput = {
  topicSpaceId: string;
  edgeId: string;
  text: string;
  numFrames?: number;
  spatialControl?: SpatialControl;
  seed?: number;
  forceRegenerate?: boolean;
  floodLength?: number;
  floodSmoothingAlpha?: number;
  floodNumDenoiseSteps?: number;
};

export type MotionComparisonResult = {
  momask: SkeletonMotionResult;
  omnicontrol: SkeletonMotionResult;
  flooddiffusion?: FloodDiffusionMotionResponse;
};

export async function generateMotionComparison(
  db: PrismaClient,
  input: GenerateMotionComparisonInput,
): Promise<MotionComparisonResult> {
  const numFrames = input.numFrames ?? 24;
  const floodLength =
    input.floodLength ?? floodLatentTokensFromFrames(numFrames);

  const floodEnabled = Boolean(process.env.MODAL_FLOODDIFFUSION_URL);

  const [momask, omnicontrol, flooddiffusion] = await Promise.all([
    generateSkeletonMotion(db, {
      ...input,
      model: "momask",
      forceRegenerate: input.forceRegenerate,
    }),
    generateSkeletonMotion(db, {
      ...input,
      model: "omnicontrol",
      forceRegenerate: input.forceRegenerate,
    }),
    floodEnabled
      ? generateFloodDiffusion(db, {
          topicSpaceId: input.topicSpaceId,
          edgeId: input.edgeId,
          mode: "single",
          text: input.text,
          length: floodLength,
          numDenoiseSteps: input.floodNumDenoiseSteps,
          smoothingAlpha: input.floodSmoothingAlpha ?? 0.5,
          seed: input.seed,
          forceRegenerate: input.forceRegenerate,
        })
      : Promise.resolve(undefined),
  ]);

  return {
    momask,
    omnicontrol,
    ...(flooddiffusion ? { flooddiffusion } : {}),
  };
}

function metricsTotalFrames(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== "object") return null;
  const total = (metrics as { totalFrames?: unknown }).totalFrames;
  return typeof total === "number" ? total : null;
}

function toEntrySummary(row: {
  id: string;
  model: string;
  promptHash: string;
  metrics: unknown;
  updatedAt: Date;
}): SkeletonMotionCacheEntrySummary {
  return {
    id: row.id,
    model: row.model,
    promptHash: row.promptHash,
    totalFrames: metricsTotalFrames(row.metrics),
    updatedAt: row.updatedAt,
  };
}

export async function listSkeletonMotionCache(
  db: PrismaClient,
  input: { topicSpaceId: string; edgeId?: string },
): Promise<MotionComparisonCacheGroup[]> {
  const rows = await db.skeletonMotionCache.findMany({
    where: {
      topicSpaceId: input.topicSpaceId,
      ...(input.edgeId ? { edgeId: input.edgeId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      model: true,
      promptHash: true,
      promptText: true,
      numFrames: true,
      metrics: true,
      updatedAt: true,
    },
  });

  const groups = new Map<string, MotionComparisonCacheGroup>();

  for (const row of rows) {
    const groupKey = row.promptText ?? row.promptHash;
    const existing = groups.get(groupKey) ?? {
      groupKey,
      promptText: row.promptText,
      promptHash: row.promptText ? null : row.promptHash,
      numFrames: row.model === "momask" ? row.numFrames : null,
      momask: null,
      omnicontrol: null,
      flooddiffusion: null,
      updatedAt: row.updatedAt,
    };

    const summary = toEntrySummary(row);
    if (row.model === "momask") {
      if (
        !existing.momask ||
        row.updatedAt > existing.momask.updatedAt
      ) {
        existing.momask = summary;
        existing.numFrames = row.numFrames;
      }
    } else if (row.model === "omnicontrol") {
      if (
        !existing.omnicontrol ||
        row.updatedAt > existing.omnicontrol.updatedAt
      ) {
        existing.omnicontrol = summary;
      }
    } else if (row.model === "flooddiffusion") {
      if (
        !existing.flooddiffusion ||
        row.updatedAt > existing.flooddiffusion.updatedAt
      ) {
        existing.flooddiffusion = summary;
      }
    }

    if (row.updatedAt > existing.updatedAt) {
      existing.updatedAt = row.updatedAt;
    }

    groups.set(groupKey, existing);
  }

  return [...groups.values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getMotionComparisonFromCache(
  db: PrismaClient,
  input: {
    topicSpaceId: string;
    edgeId: string;
    promptText: string;
    numFrames: number;
  },
): Promise<MotionComparisonResult | null> {
  const momaskHash = computePromptHash(
    input.promptText,
    cacheFrameCount("momask", input.numFrames),
  );
  const omniHash = computePromptHash(
    input.promptText,
    cacheFrameCount("omnicontrol", input.numFrames),
  );
  const floodHash = computeFloodPromptHash("single", {
    text: input.promptText,
    length: floodLatentTokensFromFrames(input.numFrames),
  });

  const [momaskRow, omnicontrolRow, floodRow] = await Promise.all([
    db.skeletonMotionCache.findUnique({
      where: {
        edgeId_topicSpaceId_promptHash_model: {
          edgeId: input.edgeId,
          topicSpaceId: input.topicSpaceId,
          promptHash: momaskHash,
          model: "momask",
        },
      },
    }),
    db.skeletonMotionCache.findUnique({
      where: {
        edgeId_topicSpaceId_promptHash_model: {
          edgeId: input.edgeId,
          topicSpaceId: input.topicSpaceId,
          promptHash: omniHash,
          model: "omnicontrol",
        },
      },
    }),
    db.skeletonMotionCache.findUnique({
      where: {
        edgeId_topicSpaceId_promptHash_model: {
          edgeId: input.edgeId,
          topicSpaceId: input.topicSpaceId,
          promptHash: floodHash,
          model: "flooddiffusion",
        },
      },
    }),
  ]);

  if (!momaskRow || !omnicontrolRow) return null;

  const momaskJson = momaskRow.skeletonJson as unknown as SkeletonMotionResult;
  const omniJson = omnicontrolRow.skeletonJson as unknown as SkeletonMotionResult;

  const result: MotionComparisonResult = {
    momask: {
      ...momaskJson,
      metrics:
        (momaskRow.metrics as SkeletonMotionResult["metrics"]) ?? undefined,
      model: "momask",
    },
    omnicontrol: {
      ...omniJson,
      metrics:
        (omnicontrolRow.metrics as SkeletonMotionResult["metrics"]) ??
        undefined,
      model: "omnicontrol",
    },
  };

  if (floodRow) {
    const floodJson =
      floodRow.skeletonJson as unknown as FloodDiffusionMotionResponse;
    result.flooddiffusion = {
      ...floodJson,
      metrics:
        (floodRow.metrics as FloodDiffusionMotionResponse["metrics"]) ??
        undefined,
      model: "flooddiffusion",
      floodMeta: floodJson.floodMeta,
    };
  }

  return result;
}

export async function getFloodDiffusionFromCache(
  db: PrismaClient,
  input: {
    topicSpaceId: string;
    edgeId: string;
    promptText: string;
    mode: "single" | "streaming";
    numFrames?: number;
    segments?: FloodDiffusionSegmentInput[];
  },
): Promise<FloodDiffusionMotionResponse | null> {
  const promptHash = computeFloodPromptHash(input.mode, {
    text: input.promptText,
    length: input.numFrames
      ? floodLatentTokensFromFrames(input.numFrames)
      : undefined,
    segments: input.segments,
  });

  const row = await db.skeletonMotionCache.findUnique({
    where: {
      edgeId_topicSpaceId_promptHash_model: {
        edgeId: input.edgeId,
        topicSpaceId: input.topicSpaceId,
        promptHash,
        model: "flooddiffusion",
      },
    },
  });

  if (!row) return null;

  const json = row.skeletonJson as unknown as FloodDiffusionMotionResponse;
  return {
    ...json,
    metrics:
      (row.metrics as FloodDiffusionMotionResponse["metrics"]) ?? undefined,
    model: "flooddiffusion",
    floodMeta: json.floodMeta,
  };
}
