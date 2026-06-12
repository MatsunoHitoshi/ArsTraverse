"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { api } from "@/trpc/react";
import type { CustomLinkType } from "@/app/const/types";
import type { SkeletonMotionData } from "@/app/const/skeleton-motion";

export type UseSkeletonMotionResult = {
  getSkeletonMotion: (edgeId: string) => SkeletonMotionData | null;
  isLoading: boolean;
  skeletonCacheVersion: number;
};

/**
 * T2Mモデルで骨格モーションを生成・キャッシュするフック。
 * 既存の useEdgeSemanticAnimation を置き換える。
 */
export function useSkeletonMotion({
  links,
  enabled,
  topicSpaceId,
}: {
  links: CustomLinkType[];
  enabled: boolean;
  topicSpaceId?: string;
}): UseSkeletonMotionResult {
  const isActive = enabled && !!topicSpaceId;

  const cacheRef = useRef<Map<string, SkeletonMotionData>>(new Map());
  const [skeletonCacheVersion, setSkeletonCacheVersion] = useState(0);

  const edgesToGenerate = useMemo(() => {
    if (!isActive) return [];
    return links
      .filter((l) => l.id && l.type && !cacheRef.current.has(l.id))
      .map((l) => {
        const source = typeof l.source === "object" ? l.source : null;
        const target = typeof l.target === "object" ? l.target : null;
        return {
          edgeId: l.id,
          edgeType: l.type,
          sourceName: source?.name,
          sourceLabel: source?.label,
          targetName: target?.name,
          targetLabel: target?.label,
        };
      });
  }, [links, isActive]);

  const mutation = api.kg.generateSkeletonMotion.useMutation({
    onSuccess: (data) => {
      if (!data?.frames) return;
      const edgeId = (data as unknown as { edgeId?: string }).edgeId;
      if (!edgeId) return;
      cacheRef.current.set(edgeId, {
        fps: data.fps,
        jointNames: data.jointNames,
        boneConnections: data.boneConnections,
        frames: data.frames,
      });
      setSkeletonCacheVersion((v) => v + 1);
    },
  });

  const lastEdgesKeyRef = useRef<string>("");
  useEffect(() => {
    if (!isActive || edgesToGenerate.length === 0 || !topicSpaceId) return;
    const key = edgesToGenerate.map((e) => e.edgeId).join(",");
    if (key === lastEdgesKeyRef.current) return;
    lastEdgesKeyRef.current = key;

    for (const edge of edgesToGenerate) {
      const text = buildMotionPrompt(edge);
      mutation.mutate({
        topicSpaceId,
        edgeId: edge.edgeId,
        text,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgesToGenerate, isActive, topicSpaceId]);

  const getSkeletonMotion = useCallback(
    (edgeId: string): SkeletonMotionData | null => {
      if (!isActive) return null;
      return cacheRef.current.get(edgeId) ?? null;
    },
    // skeletonCacheVersion ensures re-render when cache updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, skeletonCacheVersion],
  );

  return {
    getSkeletonMotion,
    isLoading: mutation.isPending,
    skeletonCacheVersion,
  };
}

function buildMotionPrompt(edge: {
  edgeType: string;
  sourceName?: string;
  sourceLabel?: string;
  targetName?: string;
  targetLabel?: string;
}): string {
  const parts: string[] = [];
  if (edge.sourceName) parts.push(edge.sourceName);
  parts.push(edge.edgeType.toLowerCase().replace(/_/g, " "));
  if (edge.targetName) parts.push(edge.targetName);
  return parts.join(" ");
}
