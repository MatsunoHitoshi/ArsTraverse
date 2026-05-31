"use client";
import type { DocumentResponse } from "@/app/const/types";
import { Button } from "../button/button";
import { GraphIcon } from "../icons";
import { useRouter } from "next/navigation";
import { interpolateRainbow } from "d3";
import clsx from "clsx";

type TopicGraphDocumentListProps = {
  documents: DocumentResponse[];
  start?: number;
  end?: number;
  selectedDocumentId: string;
  setSelectedDocumentId: React.Dispatch<React.SetStateAction<string>>;
  isClustered?: boolean;
};
export const TopicGraphDocumentList = ({
  documents,
  start = 0,
  end = documents.length,
  selectedDocumentId,
  setSelectedDocumentId,
  isClustered = false,
}: TopicGraphDocumentListProps) => {
  const router = useRouter();
  return (
    <div className="flex flex-col divide-y divide-slate-600 rounded-md border border-slate-400">
      {documents.length === 0 ? (
        <div className="flex flex-row items-center justify-between p-3">
          <div>ドキュメントがありません</div>
        </div>
      ) : (
        documents.slice(start, end).map((document, index) => {
          return (
            <div
              key={document.id}
              className="group relative flex w-full flex-row items-center justify-between px-4 py-1"
            >
              <button
                className={`absolute inset-0 hover:bg-slate-50/10 ${selectedDocumentId === document.id && "!bg-slate-50/30"}`}
                onClick={() => {
                  if (document.id === selectedDocumentId) {
                    setSelectedDocumentId("");
                  } else {
                    setSelectedDocumentId(document.id);
                  }
                }}
              ></button>

              <div
                style={{
                  color: isClustered
                    ? interpolateRainbow(index / documents.length).replaceAll(
                        " ",
                        "",
                      )
                    : "",
                }}
                className={`flex w-max flex-row items-center gap-4 overflow-hidden ${isClustered && "text-opacity-50"}`}
              >
                <div className="truncate">{document.name}</div>
              </div>

              <Button
                className="z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10"
                onClick={() => {
                  router.push(`/graph/${document.graph?.id}`);
                }}
              >
                <GraphIcon height={16} width={16} color="white" />
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
};
