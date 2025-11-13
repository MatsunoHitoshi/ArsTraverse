"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { DocumentForm } from "@/app/_components/form/document-form";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { Toolbar } from "@/app/_components/toolbar/toolbar";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/button/button";
import { api } from "@/trpc/react";
import { useSearchParams } from "next/navigation";
import { useWindowSize } from "@/app/_hooks/use-window-size";

export const ExtractedGraphViewer = () => {
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [graphDocument, setGraphDocument] =
    useState<GraphDocumentForFrontend | null>(null);
  const [isLinkFiltered, setIsLinkFiltered] = useState<boolean>(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const submitSourceDocumentWithGraph =
    api.sourceDocument.createWithGraphData.useMutation();

  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );
  const svgRef = useRef<SVGSVGElement>(null);

  const router = useRouter();

  const searchParams = useSearchParams();
  const hasGraphData = searchParams.get("has-graph-data");

  const submit = (
    graphDocument: GraphDocumentForFrontend,
    fileName: string,
    documentUrl: string,
  ) => {
    submitSourceDocumentWithGraph.mutate(
      {
        name: fileName,
        url: documentUrl,
        dataJson: graphDocument,
      },
      {
        onSuccess: (res) => {
          router.push(`/documents/${res?.sourceDocument.id}`);
        },
        onError: (e) => {
          console.log(e);
        },
      },
    );
  };

  useEffect(() => {
    if (hasGraphData === "true") {
      const stGraph = localStorage.getItem("graphDocument");
      const fileName = localStorage.getItem("fileName");
      const url = localStorage.getItem("fileUrl");
      const graph = stGraph
        ? (JSON.parse(stGraph) as GraphDocumentForFrontend)
        : null;

      if (graph && fileName && url) submit(graph, fileName, url);

      localStorage.removeItem("graphDocument");
      localStorage.removeItem("fileName");
      localStorage.removeItem("fileUrl");
    }
  }, []);

  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) - 18;
  const graphAreaHeight = (innerHeight ?? 300) - 130;

  return graphDocument ? (
    <div>
      <div className="h-full w-full p-2">
        <div className="flex h-full w-full flex-col divide-y divide-slate-400 overflow-hidden rounded-md border border-slate-400  text-slate-50">
          <div className="px-4">
            <Toolbar
              isLinkFiltered={isLinkFiltered}
              setIsLinkFiltered={setIsLinkFiltered}
              setNodeSearchQuery={setNodeSearchQuery}
              rightArea={
                <div className="flex flex-row items-center gap-2">
                  {file && documentUrl && (
                    <Button
                      onClick={async () => {
                        if (session) {
                          submit(graphDocument, file.name, documentUrl);
                        } else {
                          console.log("Not sign in");
                          // save graph-data, file-url and file-name to local storage
                          localStorage.setItem(
                            "graphDocument",
                            JSON.stringify(graphDocument),
                          );
                          localStorage.setItem("fileName", file.name);
                          localStorage.setItem("fileUrl", documentUrl);
                          // then signIn
                          await signIn("google", {
                            callbackUrl: "/?has-graph-data=true",
                          });
                        }
                      }}
                    >
                      グラフを保存
                    </Button>
                  )}
                </div>
              }
            />
          </div>

          <D3ForceGraph
            svgRef={svgRef}
            width={graphAreaWidth}
            height={graphAreaHeight}
            graphDocument={graphDocument}
            isLinkFiltered={isLinkFiltered}
            nodeSearchQuery={nodeSearchQuery}
            currentScale={currentScale}
            setCurrentScale={setCurrentScale}
            isLargeGraph={false}
            focusedNode={focusedNode}
            setFocusedNode={setFocusedNode}
            focusedLink={focusedLink}
            setFocusedLink={setFocusedLink}
          />
        </div>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-12 text-slate-50">
      <DocumentForm
        file={file}
        setFile={setFile}
        setGraphDocument={setGraphDocument}
        setDocumentUrl={setDocumentUrl}
        documentUrl={documentUrl}
      />
      {/* <div className="flex flex-row items-center gap-2">
        <div className="text-sm">サンプルデータを表示</div>
        <div>
          <Switch
            checked={isUseExample}
            onChange={setIsUseExample}
            className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
          >
            <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
          </Switch>
        </div>
      </div> */}
    </div>
  );
};
