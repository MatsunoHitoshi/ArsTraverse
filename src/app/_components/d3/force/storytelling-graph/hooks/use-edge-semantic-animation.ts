"use client";

import { useMemo, useRef, useEffect } from "react";
import { api } from "@/trpc/react";
import type { CustomLinkType } from "@/app/const/types";
import {
  CDT_ANIMATION_MAP,
  type EdgeMotionConfig,
} from "@/app/const/edge-cdt-animation";

/**
 * エッジ述語をCDTカテゴリに分類してアニメーション設定を返すフック。
 * enabled=false のときは何もしない（tRPC呼び出しなし）。
 * 呼び出し元はフォーカス中のエッジのみを links に渡すこと（全エッジ一括分類を避ける）。
 * links（フォーカス集合）が変わったときのみ未分類分をバッチ分類し、結果をメモ化する。
 */
export function useEdgeSemanticAnimation({
  links,
  enabled,
  topicSpaceId,
}: {
  links: CustomLinkType[];
  enabled: boolean;
  topicSpaceId?: string;
}): {
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
  isLoading: boolean;
} {
  // enabled=false または topicSpaceId 未設定の場合は空を返す
  const isActive = enabled && !!topicSpaceId;

  // エッジID → motionConfig のキャッシュ（セッション中に積み上げる）
  const cacheRef = useRef<Map<string, EdgeMotionConfig>>(new Map());

  // リクエスト対象のエッジリスト（type が空のものは除外）
  const edgesToClassify = useMemo(() => {
    if (!isActive) return [];
    return links
      .filter((l) => l.id && l.type && !cacheRef.current.has(l.id))
      .map((l) => ({ edgeId: l.id, edgeType: l.type }));
  }, [links, isActive]);

  const mutation = api.kg.classifyEdgeMotion.useMutation({
    onSuccess: (data) => {
      for (const result of data.results) {
        if (!result) continue;
        const cdtCategory = result.motionConfig.category;
        const config: EdgeMotionConfig =
          CDT_ANIMATION_MAP[cdtCategory] ?? CDT_ANIMATION_MAP.MENTAL;
        cacheRef.current.set(result.edgeId, config);
      }
    },
  });

  // edgesToClassify が変わるたびにバッチ分類を実行
  const lastEdgesKeyRef = useRef<string>("");
  useEffect(() => {
    if (!isActive || edgesToClassify.length === 0 || !topicSpaceId) return;
    const key = edgesToClassify.map((e) => e.edgeId).join(",");
    if (key === lastEdgesKeyRef.current) return;
    lastEdgesKeyRef.current = key;
    mutation.mutate({ topicSpaceId, edges: edgesToClassify });
    // mutation は依存に入れない（参照が変わるたびに再実行してしまうため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgesToClassify, isActive, topicSpaceId]);

  const getEdgeMotionConfig = useMemo<
    (edgeId: string) => EdgeMotionConfig | null
  >(() => {
    if (!isActive) return () => null;
    return (edgeId: string) => cacheRef.current.get(edgeId) ?? null;
    // cacheRef.current の変化を依存に含めるため mutation.isSuccess を加える
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, mutation.isSuccess, mutation.isPending]);

  return {
    getEdgeMotionConfig,
    isLoading: mutation.isPending,
  };
}
