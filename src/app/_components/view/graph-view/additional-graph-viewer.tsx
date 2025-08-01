import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { api } from "@/trpc/react";
import { useRef, useState } from "react";
import { NodeLinkEditModal } from "../../modal/node-link-edit-modal";
import {
  LinkPropertyEditModal,
  NodePropertyEditModal,
} from "../../modal/node-link-property-edit-modal";
import { D3ForceGraph } from "../../d3/force/graph";
import { Button } from "../../button/button";
import { Loading } from "../../loading/loading";
import { CrossLargeIcon } from "../../icons";
import { ContainerSizeProvider } from "@/providers/container-size";

const AdditionalGraphViewer = ({
  topicSpaceId,
  refetch,
  graphDocument,
  setGraphDocument,
}: {
  topicSpaceId: string;
  refetch: () => void;
  graphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
}) => {
  const integrateGraph = api.kg.integrateGraph.useMutation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(400);
  const [isIntegrating, setIsIntegrating] = useState<boolean>(false);
  const submitGraph = () => {
    setIsIntegrating(true);
    if (!topicSpaceId || !graphDocument) {
      setIsIntegrating(false);
      return;
    }
    integrateGraph.mutate(
      {
        topicSpaceId: topicSpaceId,
        graphDocument: graphDocument,
      },
      {
        onSuccess: () => {
          setIsIntegrating(false);
          setGraphDocument(null);
          refetch?.();
        },
        onError: (e) => {
          console.log(e);
          setIsIntegrating(false);
        },
      },
    );
  };

  // graph用の変数
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType>();

  // graph編集用の変数
  const [additionalGraph, setAdditionalGraph] = useState<
    GraphDocumentForFrontend | undefined
  >();
  const [isNodeLinkAttachModalOpen, setIsNodeLinkAttachModalOpen] =
    useState<boolean>(false);
  const [isNodePropertyEditModalOpen, setIsNodePropertyEditModalOpen] =
    useState<boolean>(false);
  const [isLinkPropertyEditModalOpen, setIsLinkPropertyEditModalOpen] =
    useState<boolean>(false);
  const onGraphUpdate = (additionalGraph: GraphDocumentForFrontend) => {
    console.log("onGraphUpdate", additionalGraph);
    setAdditionalGraph(additionalGraph);
    setIsNodeLinkAttachModalOpen(true);
  };

  const onNodeContextMenu = (graphNode: CustomNodeType) => {
    console.log("onNodeContextMenu", graphNode);
    setFocusedNode(graphNode);
    setIsNodePropertyEditModalOpen(true);
  };

  const onLinkContextMenu = (graphLink: CustomLinkType) => {
    console.log("onLinkContextMenu", graphLink);
    setFocusedLink(graphLink);
    setIsLinkPropertyEditModalOpen(true);
  };
  return (
    <>
      <div className="flex flex-row gap-2">
        <Button
          onClick={() => setGraphDocument(null)}
          className="!h-8 !w-8 !p-2"
        >
          <div className="h-4 w-4">
            <CrossLargeIcon color="white" width={16} height={16} />
          </div>
        </Button>
        <Button
          onClick={() => submitGraph()}
          disabled={isIntegrating}
          className="!px-2 !py-1 !text-sm"
        >
          {isIntegrating ? <Loading color="white" size={12} /> : "統合"}
        </Button>
      </div>

      <ContainerSizeProvider
        containerRef={containerRef}
        setContainerWidth={setContainerWidth}
        className="flex flex-col gap-1 rounded-md border border-gray-600"
      >
        {graphDocument && (
          <D3ForceGraph
            svgRef={svgRef}
            currentScale={currentScale}
            setCurrentScale={setCurrentScale}
            focusedNode={focusedNode}
            setFocusedNode={setFocusedNode}
            focusedLink={focusedLink}
            width={containerWidth - 2}
            height={400}
            graphDocument={graphDocument}
            isEditor={true}
            isLargeGraph={false}
            setFocusedLink={setFocusedLink}
            toolComponent={<></>}
            onGraphUpdate={onGraphUpdate}
            onNodeContextMenu={onNodeContextMenu}
            onLinkContextMenu={onLinkContextMenu}
            graphIdentifier="additional-graph-viewer"
          />
        )}
      </ContainerSizeProvider>
      <NodeLinkEditModal
        isOpen={isNodeLinkAttachModalOpen}
        setIsOpen={setIsNodeLinkAttachModalOpen}
        graphDocument={graphDocument}
        setGraphDocument={setGraphDocument}
        additionalGraph={additionalGraph}
        setAdditionalGraph={setAdditionalGraph}
      />
      <NodePropertyEditModal
        isOpen={isNodePropertyEditModalOpen}
        setIsOpen={setIsNodePropertyEditModalOpen}
        graphDocument={graphDocument}
        setGraphDocument={setGraphDocument}
        graphNode={focusedNode}
      />
      <LinkPropertyEditModal
        isOpen={isLinkPropertyEditModalOpen}
        setIsOpen={setIsLinkPropertyEditModalOpen}
        graphDocument={graphDocument}
        setGraphDocument={setGraphDocument}
        graphLink={focusedLink}
      />
    </>
  );
};

export default AdditionalGraphViewer;
