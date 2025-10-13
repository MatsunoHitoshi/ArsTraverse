import type { GraphDocumentForFrontend } from "@/app/const/types";
import React, { useEffect, useState } from "react";
import { SelectInput } from "../input/select-input";
import { nodePathSearch } from "@/app/_utils/kg/bfs";
import { ChevronRightIcon } from "../icons";

type SelectBoxOption = { id: string; label: string };

type RelationPathSearchProps = {
  defaultStartNodeId?: string;
  defaultEndNodeId?: string;
  graphData: GraphDocumentForFrontend;
  setPathData: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | undefined>
  >;
  pathData: GraphDocumentForFrontend | undefined;
};

export const RelationPathSearch = ({
  defaultStartNodeId,
  defaultEndNodeId,
  graphData,
  setPathData,
  pathData,
}: RelationPathSearchProps) => {
  const [startNode, setStartNode] = useState<SelectBoxOption>();
  const [endNode, setEndNode] = useState<SelectBoxOption>();
  const [isPathNotFound, setIsPathNotFound] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!!defaultEndNodeId && !!defaultStartNodeId) {
      const path = nodePathSearch(
        graphData,
        defaultStartNodeId,
        defaultEndNodeId,
      );
      setIsPathNotFound(path.nodes.length == 0 ? true : false);
      setPathData(path);
    }
    if (!!startNode && !!endNode) {
      const path = nodePathSearch(
        graphData,
        startNode.id ?? defaultStartNodeId,
        endNode.id ?? defaultEndNodeId,
      );
      setIsPathNotFound(path.nodes.length == 0 ? true : false);
      setPathData(path);
    }
  }, [startNode, endNode]);

  const options = graphData.nodes.map((node) => {
    return { id: node.id, label: node.name };
  });

  useEffect(() => {
    if (options && defaultStartNodeId && defaultEndNodeId) {
      setStartNode(
        options.find((o) => {
          return o.id === defaultStartNodeId;
        }),
      );
      setEndNode(
        options.find((o) => {
          return o.id === defaultEndNodeId;
        }),
      );
    }
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-semibold transition-colors hover:text-gray-300"
      >
        <span
          className={`transform transition-transform ${isOpen ? "rotate-90" : "rotate-0"}`}
        >
          <ChevronRightIcon width={16} height={16} color="white" />
        </span>
        <span>詳細検索</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1">
          <div className="text-xs">つながりの検索</div>
          <div className="flex flex-row items-center justify-between gap-2">
            <SelectInput
              options={options}
              selected={startNode}
              setSelected={setStartNode}
              borderRed={isPathNotFound}
              placeholder="このノードから"
            />
            <div>
              <ChevronRightIcon height={14} width={14} color="white" />
            </div>

            <SelectInput
              options={options}
              selected={endNode}
              setSelected={setEndNode}
              borderRed={isPathNotFound}
              placeholder="このノードまで"
            />
          </div>
          <div className="flex flex-row items-center gap-2 text-xs">
            <div>距離: </div>
            <div>
              {pathData &&
                (pathData.nodes.length === 0 ? "-" : pathData.nodes.length - 1)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
