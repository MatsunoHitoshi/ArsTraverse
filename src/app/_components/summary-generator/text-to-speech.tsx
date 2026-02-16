"use client";

import { useCallback, useEffect, useState } from "react";
import { SpeakerLoudIcon } from "../icons";
import { api } from "@/trpc/react";
import { Loading } from "../loading/loading";

type TextToSpeechProps = {
  text: string;
  className?: string;
  /** 再生開始時に呼ぶ（例: 他セグメントの停止用） */
  onPlayStart?: () => void;
  /** このセグメントのインデックス。playingSegmentIndex と組み合わせて排他制御 */
  segmentIndex?: number;
  /** 現在再生中のセグメントインデックス。他セグメントで再生開始されたら自セグメントを停止 */
  playingSegmentIndex?: number | null;
};

export const TextToSpeech = ({
  text,
  className,
  onPlayStart,
  segmentIndex,
  playingSegmentIndex,
}: TextToSpeechProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [speechFileUrl, setSpeechFileUrl] = useState<string | null>(null);
  const textToSpeech = api.assistant.textToSpeech.useMutation();

  const trimmedText = text.trim();
  const isDisabled = !trimmedText || isLoading;

  const speechPlay = useCallback(
    (url: string) => {
      setCurrentAudio((prev) => {
        prev?.pause();
        return null;
      });
      const audio = new Audio(url);
      setCurrentAudio(audio);
      setIsSpeaking(true);
      onPlayStart?.();
      audio.play().catch((error) => console.error("[TextToSpeech] play error:", error));
    },
    [onPlayStart],
  );

  useEffect(() => {
    setSpeechFileUrl(null);
    setCurrentAudio((prev) => {
      prev?.pause();
      return null;
    });
    setIsSpeaking(false);
  }, [text]);

  useEffect(() => {
    const audio = currentAudio;
    if (!audio) return;

    const onEnded = () => setIsSpeaking(false);
    const onPause = () => setIsSpeaking(false);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
    };
  }, [currentAudio]);

  useEffect(() => {
    if (
      segmentIndex !== undefined &&
      playingSegmentIndex != null &&
      playingSegmentIndex !== segmentIndex &&
      isSpeaking
    ) {
      currentAudio?.pause();
      setIsSpeaking(false);
    }
  }, [segmentIndex, playingSegmentIndex, isSpeaking, currentAudio]);

  const handleClick = async () => {
    if (isDisabled) return;

    if (isSpeaking) {
      currentAudio?.pause();
      setIsSpeaking(false);
      return;
    }

    if (speechFileUrl) {
      speechPlay(speechFileUrl);
      return;
    }

    setIsLoading(true);
    textToSpeech.mutate(
      { text: trimmedText },
      {
        onSuccess: (res: {
          url?: string;
          error?: string;
          errorDetail?: string;
        }) => {
          if (res?.error) {
            const detail = res?.errorDetail ?? res.error;
            console.error("[TextToSpeech] API error:", detail);
          } else if (typeof res?.url === "string") {
            setSpeechFileUrl(res.url);
            speechPlay(res.url);
          }
          setIsLoading(false);
        },
        onError: (e) => {
          console.error("[TextToSpeech] mutation error:", e);
          setIsLoading(false);
        },
      },
    );
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={isSpeaking ? "音声を停止" : "音声で読み上げ"}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <Loading size={16} color="#f97316" />
      ) : (
        <SpeakerLoudIcon
          height={16}
          width={16}
          color={isSpeaking ? "#f97316" : "white"}
        />
      )}
    </button>
  );
};
