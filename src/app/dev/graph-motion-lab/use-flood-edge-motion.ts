"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/trpc/react";
import type {
  FloodDiffusionMotionResponse,
  FloodDiffusionSegmentInput,
} from "@/app/const/skeleton-motion";
import {
  CUSTOM_FLOOD_STREAMING_ID,
  FLOOD_STREAMING_PRESETS,
} from "@/app/const/motion-prompt-presets";

export const LAB_TOPIC_SPACE_ID = "graph-motion-lab";

const DEFAULT_SEGMENTS = FLOOD_STREAMING_PRESETS[0]!.segments;

type EdgeMotionState = {
  segments: FloodDiffusionSegmentInput[];
  presetId: string;
  motion: FloodDiffusionMotionResponse | null;
};

function createDefaultEdgeState(): EdgeMotionState {
  return {
    segments: [...DEFAULT_SEGMENTS],
    presetId: FLOOD_STREAMING_PRESETS[0]!.id,
    motion: null,
  };
}

export function useFloodEdgeMotion() {
  const edgeStateRef = useRef<Map<string, EdgeMotionState>>(new Map());
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const getEdgeState = useCallback(
    (edgeId: string): EdgeMotionState => {
      let state = edgeStateRef.current.get(edgeId);
      if (!state) {
        state = createDefaultEdgeState();
        edgeStateRef.current.set(edgeId, state);
      }
      return state;
    },
    [],
  );

  const mutation = api.kg.generateFloodDiffusion.useMutation({
    onSuccess: (data, variables) => {
      const state = getEdgeState(variables.edgeId);
      state.motion = data;
      setError(null);
      bump();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const getSegments = useCallback(
    (edgeId: string | null): FloodDiffusionSegmentInput[] => {
      if (!edgeId) return [...DEFAULT_SEGMENTS];
      return getEdgeState(edgeId).segments;
    },
    [getEdgeState],
  );

  const getPresetId = useCallback(
    (edgeId: string | null): string => {
      if (!edgeId) return FLOOD_STREAMING_PRESETS[0]!.id;
      return getEdgeState(edgeId).presetId;
    },
    [getEdgeState],
  );

  const setSegments = useCallback(
    (edgeId: string, segments: FloodDiffusionSegmentInput[]) => {
      const state = getEdgeState(edgeId);
      state.segments = segments;
      state.presetId = CUSTOM_FLOOD_STREAMING_ID;
      bump();
    },
    [getEdgeState, bump],
  );

  const setPresetId = useCallback(
    (edgeId: string, presetId: string) => {
      const state = getEdgeState(edgeId);
      state.presetId = presetId;
      if (presetId !== CUSTOM_FLOOD_STREAMING_ID) {
        const preset = FLOOD_STREAMING_PRESETS.find((p) => p.id === presetId);
        if (preset) state.segments = [...preset.segments];
      }
      bump();
    },
    [getEdgeState, bump],
  );

  const getMotion = useCallback(
    (edgeId: string | null): FloodDiffusionMotionResponse | null => {
      if (!edgeId) return null;
      return getEdgeState(edgeId).motion;
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version triggers re-read
    [getEdgeState, version],
  );

  const clearMotion = useCallback(
    (edgeId: string) => {
      const state = getEdgeState(edgeId);
      state.motion = null;
      bump();
    },
    [getEdgeState, bump],
  );

  const generate = useCallback(
    (
      edgeId: string,
      options: {
        segments: FloodDiffusionSegmentInput[];
        smoothingAlpha: number;
        numDenoiseSteps: number | null;
        forceRegenerate?: boolean;
      },
    ) => {
      const state = getEdgeState(edgeId);
      state.segments = options.segments;
      mutation.mutate({
        topicSpaceId: LAB_TOPIC_SPACE_ID,
        edgeId,
        mode: "streaming",
        segments: options.segments,
        smoothingAlpha: options.smoothingAlpha,
        numDenoiseSteps: options.numDenoiseSteps ?? undefined,
        forceRegenerate: options.forceRegenerate,
      });
    },
    [getEdgeState, mutation],
  );

  return {
    getSegments,
    getPresetId,
    setSegments,
    setPresetId,
    getMotion,
    clearMotion,
    generate,
    isLoading: mutation.isPending,
    error,
    version,
  };
}
