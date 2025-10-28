import { useEffect, useRef, useState } from "react";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";

type MagnifierLensProps = {
  svgRef: React.RefObject<SVGSVGElement>;
  graphNodes: CustomNodeType[];
  graphLinks: CustomLinkType[];
  currentScale: number;
  currentTransformX: number;
  currentTransformY: number;
  magnifierRadius: number;
  onNodesInMagnifierChange: (
    nodeIds: string[],
    magnifications: Map<string, number>,
  ) => void;
  onLinksInMagnifierChange: (
    linkIds: string[],
    magnifications: Map<string, number>,
  ) => void;
  width: number;
  height: number;
};

export const MagnifierLens = ({
  svgRef,
  graphNodes,
  graphLinks,
  currentScale,
  currentTransformX,
  currentTransformY,
  magnifierRadius,
  onNodesInMagnifierChange,
  onLinksInMagnifierChange,
  width,
  height,
}: MagnifierLensProps) => {
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: width / 2,
    y: height / 2,
  });

  // graphNodesとgraphLinksの最新の値を保持するためのref
  const graphNodesRef = useRef(graphNodes);
  const graphLinksRef = useRef(graphLinks);

  // 最新の値を保持
  useEffect(() => {
    graphNodesRef.current = graphNodes;
    graphLinksRef.current = graphLinks;
  }, [graphNodes, graphLinks]);

  // useEffectを使ってsvgRef全体にマウスイベントを監視
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleMouseMove = (event: MouseEvent) => {
      const boundingRect = svg.getBoundingClientRect();
      setMousePosition({
        x: event.clientX - boundingRect.left,
        y: event.clientY - boundingRect.top,
      });
    };

    svg.addEventListener("mousemove", handleMouseMove);

    return () => {
      svg.removeEventListener("mousemove", handleMouseMove);
    };
  }, [svgRef]);

  // マウス位置がSVG内にあるかチェック
  const isMouseInsideSVG =
    mousePosition.x >= 0 &&
    mousePosition.x <= width &&
    mousePosition.y >= 0 &&
    mousePosition.y <= height;

  // ルーペ内のノードとエッジを特定
  useEffect(() => {
    if (!isMouseInsideSVG) {
      onNodesInMagnifierChange([], new Map());
      onLinksInMagnifierChange([], new Map());
      return;
    }

    // 画面座標からグラフ座標に変換
    // D3ZoomProviderでのtransformを考慮: translate(x,y)scale(s)
    const graphMouseX = (mousePosition.x - currentTransformX) / currentScale;
    const graphMouseY = (mousePosition.y - currentTransformY) / currentScale;
    const graphRadius = magnifierRadius / currentScale;

    // 距離から拡大率を計算する関数 (中心で急激、周縁部で緩やかに変化)
    const calculateMagnification = (
      distance: number,
      radius: number,
    ): number => {
      if (distance <= 0) return 3.0; // 中心
      if (distance >= radius) return 1.0; // 端
      // 平方根を使った補間: 中心付近で急激に変化、端ではゆっくりと1に近づく
      const ratio = distance / radius;
      return 3.0 - 2.0 * Math.sqrt(ratio);
    };

    // ルーペエリア内のノードを特定し、拡大率も計算
    const nodeMagnifications = new Map<string, number>();
    const nodesInMagnifier = graphNodesRef.current
      .filter((node) => {
        if (node.x === undefined || node.y === undefined) return false;
        const dx = node.x - graphMouseX;
        const dy = node.y - graphMouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= graphRadius) {
          // ノードの中心からの距離で拡大率を計算
          const magnification = calculateMagnification(distance, graphRadius);
          nodeMagnifications.set(node.id, magnification);
          return true;
        }
        return false;
      })
      .map((node) => node.id);

    // ルーペエリア内のエッジを特定し、拡大率も計算
    const linkMagnifications = new Map<string, number>();
    const linksInMagnifier = graphLinksRef.current
      .filter((link) => {
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (
          source.x === undefined ||
          source.y === undefined ||
          target.x === undefined ||
          target.y === undefined
        )
          return false;

        // ルーペエリアと線分の交差判定
        const startX = source.x;
        const startY = source.y;
        const endX = target.x;
        const endY = target.y;

        // 線分の各点がルーペ内かチェック
        const distanceStart = Math.sqrt(
          (startX - graphMouseX) ** 2 + (startY - graphMouseY) ** 2,
        );
        const distanceEnd = Math.sqrt(
          (endX - graphMouseX) ** 2 + (endY - graphMouseY) ** 2,
        );

        let isInMagnifier = false;
        let linkDistance = graphRadius;

        // 線分の端点のいずれかがルーペ内にあるかチェック
        if (distanceStart <= graphRadius || distanceEnd <= graphRadius) {
          isInMagnifier = true;
          linkDistance = Math.min(distanceStart, distanceEnd);
        } else {
          // 線分の中点とマウス位置の距離
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          const distanceMid = Math.sqrt(
            (midX - graphMouseX) ** 2 + (midY - graphMouseY) ** 2,
          );
          if (distanceMid <= graphRadius) {
            isInMagnifier = true;
            linkDistance = distanceMid;
          }
        }

        if (isInMagnifier) {
          // エッジの中心からの距離で拡大率を計算
          const magnification = calculateMagnification(
            linkDistance,
            graphRadius,
          );
          linkMagnifications.set(link.id, magnification);
        }

        return isInMagnifier;
      })
      .map((link) => link.id);

    onNodesInMagnifierChange(nodesInMagnifier, nodeMagnifications);
    onLinksInMagnifierChange(linksInMagnifier, linkMagnifications);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mousePosition,
    isMouseInsideSVG,
    currentScale,
    currentTransformX,
    currentTransformY,
    magnifierRadius,
    // graphNodesとgraphLinksは削除：これらは頻繁に更新されるため無限ループが発生する
    // 代わりに、useEffect内でクロージャーを通じて最新の値が参照される
    // onNodesInMagnifierChangeとonLinksInMagnifierChangeも親でメモ化されているため除外
  ]);

  if (!isMouseInsideSVG) return null;

  return (
    <>
      <g
        style={{
          pointerEvents: "none",
        }}
      >
        {/* オーバーレイ (ルーペ外を暗くする) */}
        <defs>
          <mask id="magnifier-mask">
            <rect x="0" y="0" width={width} height={height} fill="white" />
            <circle
              cx={mousePosition.x}
              cy={mousePosition.y}
              r={magnifierRadius}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="black"
          fillOpacity="0.2"
          mask="url(#magnifier-mask)"
        />
      </g>
    </>
  );
};
