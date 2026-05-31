"use client";

import { useEffect, useState } from "react";
import { SpeakerLoudIcon } from "../icons";
import { api } from "@/trpc/react";
import { Loading } from "../loading/loading";

type TextToSpeechProps = {
  text: string;
  className?: string;
};

export const TextToSpeech = ({ text, className }: TextToSpeechProps) => {
  //   const uttr = new SpeechSynthesisUtterance(text);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentAudio, setIsCurrentAudio] = useState<HTMLAudioElement>();
  const [speechFileUrl, setSpeechFileUrl] = useState<string>();
  const textToSpeech = api.assistant.textToSpeech.useMutation();

  const speechPlay = (url: string) => {
    setIsSpeaking(true);
    const audio = new Audio(url);
    setIsCurrentAudio(audio);
    audio.play().catch((error) => console.error("Error:", error));
  };

  useEffect(() => {
    const onEnded = () => {
      setIsSpeaking(false);
      currentAudio?.pause();
    };

    currentAudio?.addEventListener("ended", onEnded);
    return () => {
      currentAudio?.removeEventListener("ended", onEnded);
    };
  }, [currentAudio, setIsSpeaking]);

  return (
    <button
      className={className}
      onClick={async () => {
        if (isSpeaking) {
          setIsSpeaking(false);
          //   window.speechSynthesis.cancel();
          currentAudio?.pause();
        } else if (!speechFileUrl) {
          setIsLoading(true);
          //   window.speechSynthesis.speak(uttr);
          textToSpeech.mutate(
            { text: text },
            {
              onSuccess: (res) => {
                console.log("speech url: ", res.url);
                if (res.url) {
                  setSpeechFileUrl(res.url);
                  speechPlay(res.url);
                }
                setIsLoading(false);
              },
              onError: (e) => {
                console.log(e);
                setIsLoading(false);
              },
            },
          );
        } else {
          if (speechFileUrl) {
            console.log("speech url: ", speechFileUrl);
            speechPlay(speechFileUrl);
          }
        }
      }}
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
