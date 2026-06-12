"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseMotionPlaybackOptions = {
  /** Longest clip duration (ms); one full progress cycle matches this wall time. */
  masterDurationMs: number;
  autoPlay?: boolean;
};

export function useMotionPlayback({
  masterDurationMs,
  autoPlay = true,
}: UseMotionPlaybackOptions) {
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [loop, setLoop] = useState(true);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    lastTimeRef.current = null;
  }, []);

  const scrub = useCallback((next: number) => {
    setProgress(Math.max(0, Math.min(1, next)));
    lastTimeRef.current = null;
  }, []);

  useEffect(() => {
    if (!isPlaying || masterDurationMs <= 0) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current != null) {
        const delta = now - lastTimeRef.current;
        setProgress((prev) => {
          const next = prev + delta / masterDurationMs;
          if (loop) return next % 1;
          if (next >= 1) {
            setIsPlaying(false);
            return 1;
          }
          return next;
        });
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
  }, [isPlaying, loop, masterDurationMs]);

  useEffect(() => {
    reset();
    setIsPlaying(autoPlay);
  }, [masterDurationMs, autoPlay, reset]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
    lastTimeRef.current = null;
  }, []);

  return {
    progress,
    isPlaying,
    loop,
    setLoop,
    scrub,
    reset,
    togglePlay,
    setIsPlaying,
  };
}
