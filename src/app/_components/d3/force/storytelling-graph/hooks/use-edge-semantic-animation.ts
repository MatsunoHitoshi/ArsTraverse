"use client";

import { useCallback, useState } from "react";
import type { CustomLinkType } from "@/app/const/types";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";

/**
 * @deprecated 旧LLMパイプラインのCDT分類フック。
 * T2Mパイプライン（useSkeletonMotion）に置き換え済み。
 * 既存コンポーネントの型互換性のために空実装を維持。
 */
export type UseEdgeSemanticAnimationResult = {
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
  isLoading: boolean;
  edgeMotionCacheVersion: number;
};

export function useEdgeSemanticAnimation(_options: {
  links: CustomLinkType[];
  enabled: boolean;
  topicSpaceId?: string;
}): UseEdgeSemanticAnimationResult {
  const [edgeMotionCacheVersion] = useState(0);

  const getEdgeMotionConfig = useCallback(
    (_edgeId: string): EdgeMotionConfig | null => null,
    [],
  );

  return {
    getEdgeMotionConfig,
    isLoading: false,
    edgeMotionCacheVersion,
  };
}
