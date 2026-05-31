"use client";
import type { DocumentResponse } from "@/app/const/types";
import { Button } from "../button/button";
import { UrlCopy } from "../url-copy/url-copy";
import { DotHorizontalIcon, GraphIcon, Link2Icon, PlusIcon } from "../icons";
import { formatDate } from "@/app/_utils/date/format-date";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import Link from "next/link";

type DocumentListProps = {
  documents: DocumentResponse[];
  id?: string;
  start?: number;
  end?: number;
  menu?: (document: DocumentResponse) => React.ReactNode;
  type?: "document" | "topic";
};
export const DocumentList = ({
  documents,
  id,
  start = 0,
  end = documents.length,
  menu,
  type = "document",
}: DocumentListProps) => {
  const router = useRouter();

  const PopoverMenu = ({ document }: { document: DocumentResponse }) => {
    return (
      <Popover className="hidden group-hover:block data-[open]:block">
        <PopoverButton className="z-10 !h-8 !w-8 rounded-md bg-slate-600/90 !p-2">
          <DotHorizontalIcon height={16} width={16} color="white" />
        </PopoverButton>
        <PopoverPanel
          anchor="bottom"
          className="flex flex-col rounded-md bg-black/20 py-2 text-slate-50 backdrop-blur-2xl"
        >
          {menu?.(document)}
        </PopoverPanel>
      </Popover>
    );
  };

  return (
    <div className="flex flex-col divide-y divide-slate-600 rounded-md border border-slate-400">
      {documents.length === 0 ? (
        <div className="flex flex-row items-center justify-between p-3">
          <div>ドキュメントがありません</div>
          {type === "document" && (
            <Link href="/">
              <Button className="flex flex-row items-center gap-1">
                <PlusIcon width={16} height={16} color="white" />
                <div className="text-sm">新規ドキュメント</div>
              </Button>
            </Link>
          )}
        </div>
      ) : (
        documents.slice(start, end).map((document) => {
          return (
            <div
              key={document.id}
              className="group relative flex flex-row items-center justify-between px-4 py-1"
            >
              <button
                className={`absolute inset-0 hover:bg-slate-50/10 ${id === document.id && "!bg-slate-50/30"}`}
                onClick={() => {
                  router.push(`/documents/${document.id}`);
                }}
              ></button>

              {menu && (
                <div className="absolute right-1">
                  <PopoverMenu document={document} />
                </div>
              )}

              <div className="flex w-max flex-row items-center gap-4 overflow-hidden">
                <div className="truncate">{document.name}</div>
              </div>

              <div className="flex min-w-[216px] flex-row items-center justify-between gap-2">
                <Button
                  className="z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10"
                  onClick={() => {
                    router.push(`/graph/${document.graph?.id}`);
                  }}
                >
                  <GraphIcon height={16} width={16} color="white" />
                </Button>

                <UrlCopy
                  messagePosition="inButton"
                  className="z-10 flex !h-8 !w-8 flex-row items-center justify-center bg-transparent px-0 py-0 hover:bg-slate-50/10"
                  url={`${env.NEXT_PUBLIC_BASE_URL}/graph/${document.graph?.id}`}
                >
                  <div className="h-4 w-4">
                    <Link2Icon height={16} width={16} color="white" />
                  </div>
                </UrlCopy>
                <div className="w-[128px] text-right text-sm">
                  {formatDate(document.createdAt)}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export const DocumentListMenuButton = ({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) => {
  return (
    <button className="w-full px-2 py-1 hover:bg-slate-50/10" onClick={onClick}>
      <div className="flex flex-row items-center gap-1">
        <div className="h-4 w-4">{icon}</div>
        {children}
      </div>
    </button>
  );
};
