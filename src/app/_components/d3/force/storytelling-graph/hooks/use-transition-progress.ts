import { useMemo } from "react";
import { easeOutCubic } from "../utils/graph-utils";

export const FOCUS_TRANSITION_MS = 1200;
const FADE_DELAY_MS = 200;
const FADE_DURATION_MS = FOCUS_TRANSITION_MS - FADE_DELAY_MS;

export function useTransitionProgress(transitionElapsedMs: number) {
  const isTransitionComplete = transitionElapsedMs >= FOCUS_TRANSITION_MS;

  const viewProgress = useMemo(
    () =>
      isTransitionComplete
        ? 1
        : easeOutCubic(Math.min(1, transitionElapsedMs / FOCUS_TRANSITION_MS)),
    [transitionElapsedMs, isTransitionComplete],
  );

  const fadeProgress = useMemo(
    () =>
      isTransitionComplete
        ? 1
        : transitionElapsedMs <= FADE_DELAY_MS
          ? 0
          : easeOutCubic(
              Math.min(1, (transitionElapsedMs - FADE_DELAY_MS) / FADE_DURATION_MS),
            ),
    [transitionElapsedMs, isTransitionComplete],
  );

  return { isTransitionComplete, viewProgress, fadeProgress };
}
