"use client";

import React, { useState } from "react";
import { Switch } from "@headlessui/react";
import { ChevronRightIcon } from "../icons";
import { TopicGraphDocumentList } from "../list/topic-graph-document-list";
import type { DocumentResponse } from "@/app/const/types";

interface DocumentListSectionProps {
  documents: DocumentResponse[];
  selectedDocumentId: string;
  setSelectedDocumentId: React.Dispatch<React.SetStateAction<string>>;
  isClustered: boolean;
  setIsClustered: React.Dispatch<React.SetStateAction<boolean>>;
  defaultOpen?: boolean;
}

export const TopicSpaceDocumentListSection: React.FC<
  DocumentListSectionProps
> = ({
  documents,
  selectedDocumentId,
  setSelectedDocumentId,
  isClustered,
  setIsClustered,
  defaultOpen = true,
}) => {
  const [isDocumentListOpen, setIsDocumentListOpen] =
    useState<boolean>(defaultOpen);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex w-full flex-row items-center justify-between">
        <button
          onClick={() => setIsDocumentListOpen(!isDocumentListOpen)}
          className="flex items-center gap-2 font-semibold transition-colors hover:text-gray-300"
        >
          <span
            className={`transform transition-transform ${isDocumentListOpen ? "rotate-90" : "rotate-0"}`}
          >
            <ChevronRightIcon width={16} height={16} color="white" />
          </span>
          <span>ドキュメント</span>
        </button>
        <div className="flex flex-row items-center gap-2">
          <div className="text-sm">色分け</div>
          <div>
            <Switch
              checked={isClustered}
              onChange={setIsClustered}
              className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
            >
              <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
            </Switch>
          </div>
        </div>
      </div>

      {isDocumentListOpen && (
        <TopicGraphDocumentList
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          setSelectedDocumentId={setSelectedDocumentId}
          isClustered={isClustered}
        />
      )}
    </div>
  );
};
