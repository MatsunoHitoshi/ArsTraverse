"use client";
import { Button } from "../button/button";
import { FileTextIcon, GraphIcon, Link2Icon } from "../icons";
import { useRouter } from "next/navigation";
import { UrlCopy } from "../url-copy/url-copy";
import { env } from "@/env";
import { D3ForceGraph } from "../d3/force/graph";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { api } from "@/trpc/react";
import { exportTxt } from "@/app/_utils/sys/svg";
import { useRef, useState } from "react";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
export const DocumentDetail = ({ documentId }: { documentId: string }) => {
  const router = useRouter();
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) / 2 - 24;
  const graphAreaHeight = (innerHeight ?? 300) - 128;
  const { data: document } = api.sourceDocument.getById.useQuery({
    id: documentId,
  });
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );
  const svgRef = useRef<SVGSVGElement>(null);

  if (!document) return null;
  return (
    <div className="flex w-full flex-col items-start">
      <D3ForceGraph
        svgRef={svgRef}
        width={graphAreaWidth}
        height={graphAreaHeight}
        graphDocument={document.graph.dataJson}
        currentScale={currentScale}
        setCurrentScale={setCurrentScale}
        isLargeGraph={false}
        focusedNode={focusedNode}
        setFocusedNode={setFocusedNode}
        focusedLink={focusedLink}
        setFocusedLink={setFocusedLink}
        toolComponent={
          <>
            <div
              className={`absolute !w-[${graphAreaWidth}px] bg-slate-950/20 p-2 backdrop-blur-sm`}
            >
              <div className="flex w-full flex-row items-center justify-between gap-2">
                <div className="flex flex-row items-center gap-2">
                  {document.url.includes("/input-txt/") ? (
                    <Button
                      className="z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10"
                      onClick={() => {
                        exportTxt(document.url, document.name);
                      }}
                    >
                      <FileTextIcon height={16} width={16} color="white" />
                    </Button>
                  ) : (
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="z-10 truncate no-underline hover:underline"
                      href={document.url}
                    >
                      <Button className="z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10">
                        <FileTextIcon height={16} width={16} color="white" />
                      </Button>
                    </a>
                  )}

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
                </div>
                <div className="text-lg">{document.name}</div>
              </div>
            </div>

            <div
              className={`absolute bottom-3 flex w-1/3 flex-row gap-2 rounded-lg bg-black/20 px-4 py-3 text-sm text-white backdrop-blur-sm`}
            >
              <div></div>
              <div
                className={`max-h-[250px] overflow-y-scroll whitespace-pre-wrap text-sm`}
              >
                {document.text}
              </div>
            </div>
          </>
        }
      />
    </div>
  );
};
