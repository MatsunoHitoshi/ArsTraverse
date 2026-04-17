import { useEffect, useMemo, useRef, useState } from "react";

const STEADY_PULSE_PERIOD_MS = 3000;
const STEADY_EDGE_FLOW_PERIOD_MS = 3000;
const STEADY_EDGE_FLOW_VALLEY_WIDTH = 0.2;
const STEADY_EDGE_FLOW_MIN_OPACITY = 0.2;
const STEADY_ANIM_FADE_IN_MS = 50;

export function useSteadyAnimation({
  isTransitionComplete,
  freeExploreMode,
  showFullGraph,
}: {
  isTransitionComplete: boolean;
  freeExploreMode: boolean;
  showFullGraph: boolean;
}) {
  const shouldRunSteadyAnim = isTransitionComplete && !freeExploreMode && !showFullGraph;
  const steadyRafRef = useRef<number | null>(null);
  const steadyStartRef = useRef<number | null>(null);
  const [steadyAnimTimeMs, setSteadyAnimTimeMs] = useState(0);

  useEffect(() => {
    if (!shouldRunSteadyAnim) {
      if (steadyRafRef.current != null) {
        cancelAnimationFrame(steadyRafRef.current);
        steadyRafRef.current = null;
      }
      steadyStartRef.current = null;
      setSteadyAnimTimeMs(0);
      return;
    }
    const tick = (now: number) => {
      if (steadyStartRef.current == null) {
        steadyStartRef.current = now;
      }
      setSteadyAnimTimeMs(now - steadyStartRef.current);
      steadyRafRef.current = requestAnimationFrame(tick);
    };
    steadyRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (steadyRafRef.current != null) {
        cancelAnimationFrame(steadyRafRef.current);
        steadyRafRef.current = null;
      }
    };
  }, [shouldRunSteadyAnim]);

  const nodePulseScale = useMemo(() => {
    if (!shouldRunSteadyAnim) return 1;
    const phase = (steadyAnimTimeMs % STEADY_PULSE_PERIOD_MS) / STEADY_PULSE_PERIOD_MS;
    const fadeIn = Math.min(1, steadyAnimTimeMs / STEADY_ANIM_FADE_IN_MS);
    const amplitude = 0.1 * fadeIn;
    return 1 + amplitude * 0.5 * (1 - Math.cos(2 * Math.PI * phase));
  }, [shouldRunSteadyAnim, steadyAnimTimeMs]);

  const edgeFlowStops = useMemo(() => {
    if (!shouldRunSteadyAnim) return null;
    const fadeIn = Math.min(1, steadyAnimTimeMs / STEADY_ANIM_FADE_IN_MS);
    const effectiveMinOpacity = 1 - (1 - STEADY_EDGE_FLOW_MIN_OPACITY) * fadeIn;
    const totalRange = 1 + 2 * STEADY_EDGE_FLOW_VALLEY_WIDTH;
    const rawPhase =
      (steadyAnimTimeMs % STEADY_EDGE_FLOW_PERIOD_MS) / STEADY_EDGE_FLOW_PERIOD_MS;
    const flowCenter = -STEADY_EDGE_FLOW_VALLEY_WIDTH + rawPhase * totalRange;

    const stops: Array<{ offset: string; opacity: number }> = [];
    const numSteps = 10;
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const dist = Math.abs(t - flowCenter);
      const normalized = Math.min(1, dist / STEADY_EDGE_FLOW_VALLEY_WIDTH);
      const smooth = normalized * normalized * (3 - 2 * normalized);
      const opacity = effectiveMinOpacity + (1 - effectiveMinOpacity) * smooth;
      stops.push({ offset: `${(t * 100).toFixed(1)}%`, opacity });
    }
    return stops;
  }, [shouldRunSteadyAnim, steadyAnimTimeMs]);

  return { shouldRunSteadyAnim, nodePulseScale, edgeFlowStops };
}
