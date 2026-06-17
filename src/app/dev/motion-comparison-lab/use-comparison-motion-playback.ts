"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseComparisonMotionPlaybackOptions = {
  momaskDurationMs: number;
  omnicontrolDurationMs: number;
  flooddiffusionDurationMs: number;
  autoPlay?: boolean;
};

/**
 * Independent progress per model (each clip runs at its natural duration).
 * Play / pause / loop are shared so all start and stop together.
 */
export function useComparisonMotionPlayback({
  momaskDurationMs,
  omnicontrolDurationMs,
  flooddiffusionDurationMs,
  autoPlay = true,
}: UseComparisonMotionPlaybackOptions) {
  const [momaskProgress, setMomaskProgress] = useState(0);
  const [omnicontrolProgress, setOmnicontrolProgress] = useState(0);
  const [flooddiffusionProgress, setFlooddiffusionProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [loop, setLoop] = useState(true);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setMomaskProgress(0);
    setOmnicontrolProgress(0);
    setFlooddiffusionProgress(0);
    lastTimeRef.current = null;
  }, []);

  const scrubMomask = useCallback((next: number) => {
    setMomaskProgress(Math.max(0, Math.min(1, next)));
    lastTimeRef.current = null;
  }, []);

  const scrubOmnicontrol = useCallback((next: number) => {
    setOmnicontrolProgress(Math.max(0, Math.min(1, next)));
    lastTimeRef.current = null;
  }, []);

  const scrubFlooddiffusion = useCallback((next: number) => {
    setFlooddiffusionProgress(Math.max(0, Math.min(1, next)));
    lastTimeRef.current = null;
  }, []);

  const durationKey = `${momaskDurationMs}:${omnicontrolDurationMs}:${flooddiffusionDurationMs}`;

  useEffect(() => {
    const anyDuration =
      momaskDurationMs > 0 ||
      omnicontrolDurationMs > 0 ||
      flooddiffusionDurationMs > 0;

    if (!isPlaying || !anyDuration) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current != null) {
        const delta = now - lastTimeRef.current;

        if (momaskDurationMs > 0) {
          setMomaskProgress((prev) => {
            const next = prev + delta / momaskDurationMs;
            if (loop) return next % 1;
            if (next >= 1) return 1;
            return next;
          });
        }

        if (omnicontrolDurationMs > 0) {
          setOmnicontrolProgress((prev) => {
            const next = prev + delta / omnicontrolDurationMs;
            if (loop) return next % 1;
            if (next >= 1) return 1;
            return next;
          });
        }

        if (flooddiffusionDurationMs > 0) {
          setFlooddiffusionProgress((prev) => {
            const next = prev + delta / flooddiffusionDurationMs;
            if (loop) return next % 1;
            if (next >= 1) return 1;
            return next;
          });
        }
      }
      lastTimeRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    isPlaying,
    loop,
    momaskDurationMs,
    omnicontrolDurationMs,
    flooddiffusionDurationMs,
  ]);

  useEffect(() => {
    reset();
    setIsPlaying(autoPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when clip lengths change
  }, [durationKey, autoPlay, reset]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
    lastTimeRef.current = null;
  }, []);

  return {
    momaskProgress,
    omnicontrolProgress,
    flooddiffusionProgress,
    isPlaying,
    loop,
    setLoop,
    scrubMomask,
    scrubOmnicontrol,
    scrubFlooddiffusion,
    reset,
    togglePlay,
    setIsPlaying,
  };
}
