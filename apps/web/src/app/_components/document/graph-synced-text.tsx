import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import type {
  CustomLinkType,
  CustomNodeType,
  NodeTypeForFrontend,
} from "@/app/const/types";
import { useEffect, useRef, useState } from "react";

const nodeHighlightedText = (
  text: string,
  searchTerms: { identifier: string; value: string | undefined }[],
) => {
  const filteredSearchTerms = searchTerms.filter(
    (term) => term.value !== undefined,
  );

  if (filteredSearchTerms.length === 0) {
    return text;
  }

  const escapedTerms = filteredSearchTerms.map(
    (term) => term.value?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "",
  );
  const combinedRegex = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const parts = text.split(combinedRegex);

  return parts
    .map((part, index) => {
      if (part === "") return null;

      const isSourceMatch = filteredSearchTerms.some(
        (term) =>
          term.identifier === "source" &&
          term.value?.toLowerCase() === part.toLowerCase(),
      );
      const isTargetMatch = filteredSearchTerms.some(
        (term) =>
          term.identifier === "target" &&
          term.value?.toLowerCase() === part.toLowerCase(),
      );
      const isNodeMatch = filteredSearchTerms.some(
        (term) =>
          term.identifier === "node" &&
          term.value?.toLowerCase() === part.toLowerCase(),
      );

      if (isSourceMatch || isTargetMatch) {
        return (
          <span
            key={index}
            className={`bg-yellow-400 font-semibold text-black ${isSourceMatch && "text-node-source"} ${isTargetMatch && "text-node-target"}`}
          >
            {part}
          </span>
        );
      } else if (isNodeMatch) {
        return (
          <span
            key={index}
            className={`bg-orange-400 font-semibold text-black`}
          >
            {part}
          </span>
        );
      }
      return part;
    })
    .filter(Boolean);
};

export const GraphSyncedText = ({
  focusedLink,
  focusedNode,
  text,
  graphNodes,
}: {
  focusedLink: CustomLinkType | undefined;
  focusedNode: CustomNodeType | undefined;
  text: string;
  graphNodes: NodeTypeForFrontend[];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [connectionLine, setConnectionLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  useEffect(() => {
    if (!focusedLink || !containerRef.current) {
      setConnectionLine(null);
      return;
    }

    const sourceElement =
      containerRef.current?.querySelector(".text-node-source");
    const targetElement =
      containerRef.current?.querySelector(".text-node-target");

    if (sourceElement && targetElement) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const sourceRect = sourceElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();

      const x1 = sourceRect.right - containerRect.left;
      const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
      const x2 = targetRect.left - containerRect.left;
      const y2 = targetRect.top + targetRect.height / 2 - containerRect.top;

      setConnectionLine({ x1, y1, x2, y2 });
    } else {
      setConnectionLine(null);
    }
  }, [focusedLink, text]);

  if (!focusedNode?.name && !focusedLink) {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }
  if (!focusedLink?.sourceId || !focusedLink?.targetId) {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }

  const searchTerms = [
    { identifier: "node", value: focusedNode?.name },
    {
      identifier: "source",
      value: getNodeByIdForFrontend(focusedLink.sourceId, graphNodes)?.name,
    },
    {
      identifier: "target",
      value: getNodeByIdForFrontend(focusedLink.targetId, graphNodes)?.name,
    },
  ];

  return (
    <div className="relative whitespace-pre-wrap" ref={containerRef}>
      {nodeHighlightedText(text, searchTerms)}
      {connectionLine && (
        <svg
          className="pointer-events-none absolute left-0 top-0 h-full w-full"
          style={{ zIndex: 10 }}
        >
          <line
            x1={connectionLine.x1}
            y1={connectionLine.y1}
            x2={connectionLine.x2}
            y2={connectionLine.y2}
            stroke="#fb923c"
            opacity={0.4}
            strokeWidth={6}
            strokeDasharray="5,5"
            markerEnd="url(#arrowhead)"
          />
        </svg>
      )}
    </div>
  );
};
