import type { GraphDocumentForFrontend } from "@/app/const/types";
import { useState } from "react";
import { Button } from "../button/button";
import { api } from "@/trpc/react";
import { Loading } from "../loading/loading";
import { UrlCopy } from "../url-copy/url-copy";
import { ClipboardIcon } from "../icons";
import { signIn, useSession } from "next-auth/react";
import Markdown from "react-markdown";
import { TextToSpeech } from "./text-to-speech";

type GraphSummaryGeneratorProps = {
  graphData: GraphDocumentForFrontend;
  defaultStartNodeId: string;
  defaultEndNodeId: string;
};

export const GraphSummaryGenerator = ({
  graphData,
  defaultStartNodeId,
  defaultEndNodeId,
}: GraphSummaryGeneratorProps) => {
  const [generationStarted, setGenerationStarted] = useState<boolean>(false);
  const [summary, setSummary] = useState<string>();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { data: session } = useSession();
  const [contentType, setContentType] = useState<"summary" | "outline">();

  const summarizeGraph = api.assistant.graphSummary.useMutation();
  const outlineGraph = api.assistant.graphOutline.useMutation();
  const submitForSummary = () => {
    setGenerationStarted(true);
    setIsProcessing(true);
    setContentType("summary");
    summarizeGraph.mutate(
      {
        graphData: graphData,
        startId: defaultStartNodeId,
        endId: defaultEndNodeId,
      },
      {
        onSuccess: (res) => {
          const handler = async () => {
            if (res) {
              for await (const val of res) {
                setSummary((prev) => (prev ?? "") + val.summary);
              }
              setIsProcessing(false);
            }
          };
          handler().catch((e) => {
            console.log(e);
            setIsProcessing(false);
          });
        },
        onError: (e) => {
          console.log(e);
          setIsProcessing(false);
        },
      },
    );
  };

  const submitForOutline = () => {
    console.log("submitForOutline");
    setGenerationStarted(true);
    setIsProcessing(true);
    setContentType("outline");
    outlineGraph.mutate(
      {
        graphData: graphData,
        startId: defaultStartNodeId,
        endId: defaultEndNodeId,
      },
      {
        onSuccess: (res) => {
          const handler = async () => {
            if (res) {
              for await (const val of res) {
                setSummary((prev) => (prev ?? "") + val.summary);
              }
              setIsProcessing(false);
            }
          };
          handler().catch((e) => {
            console.log(e);
            setIsProcessing(false);
          });
        },
        onError: (e) => {
          console.log(e);
          setIsProcessing(false);
        },
      },
    );
  };

  if (!generationStarted) {
    if (session) {
      return (
        <div className="flex flex-row gap-2">
          <Button className="!w-full" onClick={() => submitForSummary()}>
            <div className="text-sm">解説</div>
          </Button>
          <Button className="!w-full" onClick={() => submitForOutline()}>
            <div className="text-sm">アウトライン</div>
          </Button>
        </div>
      );
    } else {
      return (
        <Button
          className="!w-full"
          onClick={() => signIn("google", { callbackUrl: location.pathname })}
        >
          <div className="text-sm">ログイン/サインインして解説を作成</div>
        </Button>
      );
    }
  } else {
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-row items-center gap-2">
          <div className="font-semibold">
            {contentType === "summary" ? "解説" : "アウトライン"}
          </div>
          {isProcessing ? (
            <Loading size={16} color="white" />
          ) : (
            <div className="flex flex-row items-center justify-end gap-2">
              {summary ? (
                <div>
                  <TextToSpeech
                    text={summary}
                    className="z-10 flex !h-8 !w-8 flex-row items-center justify-center rounded-md bg-slate-800 px-0 py-0 hover:bg-slate-50/10"
                  />
                </div>
              ) : (
                <></>
              )}

              <div>
                <UrlCopy
                  messagePosition="inButton"
                  className="z-10 flex !h-8 !w-8 flex-row items-center justify-center bg-slate-800 px-0 py-0 hover:bg-slate-50/10"
                  url={summary}
                >
                  <div className="h-4 w-4">
                    <ClipboardIcon height={16} width={16} color="white" />
                  </div>
                </UrlCopy>
              </div>
            </div>
          )}
        </div>
        <div className="w-full whitespace-pre-wrap text-sm">
          <Markdown>{summary}</Markdown>
        </div>

        {/* {!isProcessing && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            {summary ? (
              <div>
                <TextToSpeech
                  text={summary}
                  className="z-10 flex !h-8 !w-8 flex-row items-center justify-center rounded-md bg-slate-800 px-0 py-0 hover:bg-slate-50/10"
                />
              </div>
            ) : (
              <></>
            )}

            <div>
              <UrlCopy
                messagePosition="inButton"
                className="z-10 flex !h-8 !w-8 flex-row items-center justify-center bg-slate-800 px-0 py-0 hover:bg-slate-50/10"
                url={summary}
              >
                <div className="h-4 w-4">
                  <ClipboardIcon height={16} width={16} color="white" />
                </div>
              </UrlCopy>
            </div>
          </div>
        )} */}
      </div>
    );
  }
};
