"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import type {
  GraphDocumentForFrontend,
  CustomNodeType,
} from "@/app/const/types";
import { ReadOnlyTipTapViewer } from "./read-only-tiptap-viewer";
import { D3ForceGraph } from "../d3/force/graph";
import { RelatedNodesAndLinksViewer } from "../view/graph-view/related-nodes-viewer";
import type { JSONContent } from "@tiptap/react";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { DirectedLinksToggleButton } from "../view/graph-view/directed-links-toggle-button";
import { Button } from "../button/button";
import { CrossLargeIcon, MapIcon, ZoomInIcon } from "../icons";
import Image from "next/image";
import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";
import { filterGraphByEntityNames } from "@/app/_utils/kg/filter-graph-by-entity-names";
import { select, zoomTransform, pointer, zoom } from "d3";
import type * as d3 from "d3";

interface PublicArticleViewerProps {
  content: JSONContent;
  graphDocument: GraphDocumentForFrontend | undefined;
  topicSpaceId: string;
  workspaceName: string;
  userName: string;
  userImage: string;
}

export const PublicArticleViewer: React.FC<PublicArticleViewerProps> = ({
  content,
  graphDocument,
  topicSpaceId,
  workspaceName,
  userName,
  userImage,
}) => {
  const [innerWidth, innerHeight] = useWindowSize();
  const [activeEntity, setActiveEntity] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const [isDirectedLinks, setIsDirectedLinks] = useState<boolean>(false);
  const [magnifierMode, setMagnifierMode] = useState(0);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const svgRef = useRef<SVGSVGElement>(null);

  // グラフサイズの状態管理
  const [graphSize, setGraphSize] = useState({ width: 280, height: 280 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isGraphVisible, setIsGraphVisible] = useState(true);

  // 画面幅がxl（1280px）より小さくなったらグラフを非表示に、xl以上になったら表示する
  useEffect(() => {
    const xlBreakpoint = 1280;
    if (innerWidth !== undefined) {
      if (innerWidth < xlBreakpoint) {
        setIsGraphVisible(false);
      } else {
        setIsGraphVisible(true);
      }
    }
  }, [innerWidth]);

  // リサイズ開始（マウスとタッチの両方に対応）
  const handleResizeStart = (
    e: React.MouseEvent | React.TouchEvent,
    clientX: number,
    clientY: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: clientX,
      y: clientY,
      width: graphSize.width,
      height: graphSize.height,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    handleResizeStart(e, e.clientX, e.clientY);
  };

  const handleResizeTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      handleResizeStart(e, touch.clientX, touch.clientY);
    }
  };

  // ダブルクリックでサイズをトグル
  const handleResizeDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const minWidth = 200;
    const minHeight = 200;
    const windowMaxWidth = (innerWidth ?? 1920) * 0.8;
    const windowMaxHeight = (innerHeight ?? 1080) * 0.8;
    const toggleSmallSize = { width: minWidth, height: minHeight };
    const toggleLargeSize = { width: windowMaxWidth, height: windowMaxHeight };
    const isLarge =
      graphSize.width >= (toggleSmallSize.width + toggleLargeSize.width) / 2 &&
      graphSize.height >= (toggleSmallSize.height + toggleLargeSize.height) / 2;
    setGraphSize({
      width: isLarge ? toggleSmallSize.width : toggleLargeSize.width,
      height: isLarge ? toggleSmallSize.height : toggleLargeSize.height,
    });
  };

  // マウス/タッチ移動処理
  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (clientX: number, clientY: number) => {
      const deltaX = clientX - resizeStart.x;
      const deltaY = clientY - resizeStart.y;

      const minWidth = 200;
      const minHeight = 200;
      const windowMaxWidth = (innerWidth ?? 1920) * 0.8;
      const windowMaxHeight = (innerHeight ?? 1080) * 0.8;

      // 左下のハンドル: 左にドラッグで幅拡大、下にドラッグで高さ拡大
      let newWidth = resizeStart.width - deltaX;
      let newHeight = resizeStart.height + deltaY;

      // サイズ制限を適用
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > windowMaxWidth) newWidth = windowMaxWidth;
      if (newHeight < minHeight) newHeight = minHeight;
      if (newHeight > windowMaxHeight) newHeight = windowMaxHeight;

      setGraphSize({
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const handleEnd = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isResizing, resizeStart, innerWidth, innerHeight]);

  // wheelイベントでグラフをズームする
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const handleWheel = (e: WheelEvent) => {
      // SVG要素内でのみ処理
      if (!svgElement.contains(e.target as Node)) return;

      e.preventDefault();
      const wheelDelta = -e.deltaY * 0.001;

      // 現在のtransformを取得
      const currentTransform = zoomTransform(svgElement);
      const newScale = Math.max(
        0.1,
        Math.min(10, currentTransform.k * Math.pow(2, wheelDelta)),
      );

      // マウス位置を中心にズーム
      const [x, y] = pointer(e, svgElement);
      const newTransform = currentTransform
        .translate(x, y)
        .scale(newScale)
        .translate(-x, -y);

      // D3のzoomBehaviorを取得して適用
      const svgScreen = select<SVGSVGElement, unknown>(svgElement);
      const zoomBehavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 10])
        .on("zoom", (zoomEvent: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          setCurrentScale(zoomEvent.transform.k);
        });

      zoomBehavior.transform(svgScreen, newTransform);
    };

    svgElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      svgElement.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const filteredGraphDocument = useMemo(() => {
    const entitiesInText = findEntityHighlights(content.content ?? []);
    const entitiesInTextNames = entitiesInText.map((entity) => entity.name);
    return filterGraphByEntityNames(graphDocument, entitiesInTextNames);
  }, [graphDocument, content]);

  const handleEntityClick = (entityName: string) => {
    if (!graphDocument) return;
    const foundNode = graphDocument.nodes.find(
      (n: CustomNodeType) => n.name === entityName,
    );
    if (foundNode) {
      setActiveEntity(foundNode);
    }
  };

  const updateActiveEntity = (entity: CustomNodeType | undefined) => {
    setActiveEntity(entity);
  };

  return (
    <div className="flex flex-row gap-1">
      <div className="mx-auto my-8 flex w-full max-w-[760px] flex-col gap-2 bg-slate-900 p-4 font-sans">
        <div className="flex  w-full flex-col transition-all duration-300">
          <div className="flex flex-col gap-12 bg-slate-900">
            <div className="flex w-full flex-col items-start gap-8">
              <h1 className="text-4xl font-bold text-white">{workspaceName}</h1>
              <div className="flex flex-row items-center gap-2">
                <Image
                  src={userImage}
                  alt={userName}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
                <span className="text-sm text-white">{userName}</span>
              </div>
            </div>

            {/* Read-only TipTap Viewer */}
            <div className="flex-grow">
              {graphDocument && (
                <ReadOnlyTipTapViewer
                  content={content}
                  entities={graphDocument.nodes}
                  onEntityClick={handleEntityClick}
                />
              )}
            </div>
          </div>
        </div>

        <div className="fixed right-0 top-14 flex flex-col gap-1 px-3 xl:top-24">
          <div className="flex flex-row items-start gap-1 transition-all duration-300">
            {isGraphVisible ? (
              <>
                <Button
                  size="small"
                  onClick={() => setIsGraphVisible(false)}
                  className="!h-8 !w-8 !p-2"
                >
                  <CrossLargeIcon width={16} height={16} color="white" />
                </Button>

                <div
                  ref={graphContainerRef}
                  className={`relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-gray-300 bg-slate-900/75 text-gray-400 backdrop-blur-sm ${
                    !isResizing ? "transition-all duration-300 ease-in-out" : ""
                  }`}
                  style={{
                    width: `${graphSize.width}px`,
                    height: `${graphSize.height}px`,
                  }}
                >
                  {filteredGraphDocument ? (
                    <>
                      {activeEntity ? (
                        <RelatedNodesAndLinksViewer
                          node={activeEntity}
                          topicSpaceId={topicSpaceId}
                          className="h-full w-full"
                          height={graphSize.height}
                          width={graphSize.width}
                          setFocusedNode={setActiveEntity}
                          focusedNode={activeEntity}
                          onClose={() => updateActiveEntity(undefined)}
                        />
                      ) : (
                        <D3ForceGraph
                          key={`graph-${graphSize.width}-${graphSize.height}`}
                          svgRef={svgRef}
                          width={graphSize.width}
                          height={graphSize.height}
                          graphDocument={filteredGraphDocument}
                          isLinkFiltered={false}
                          currentScale={currentScale}
                          setCurrentScale={setCurrentScale}
                          setFocusedNode={setActiveEntity}
                          isDirectedLinks={isDirectedLinks}
                          focusedNode={activeEntity}
                          setFocusedLink={() => {
                            // リンクフォーカス機能は現在使用しない
                          }}
                          toolComponent={
                            <div className="absolute ml-1 mt-1 flex flex-row items-center gap-1">
                              <Button
                                size="small"
                                onClick={() =>
                                  setMagnifierMode((prev) => (prev + 1) % 3)
                                }
                                className={`flex items-center gap-1 ${
                                  magnifierMode === 1
                                    ? "bg-orange-500/40"
                                    : magnifierMode === 2
                                      ? "bg-orange-700/40"
                                      : ""
                                }`}
                              >
                                <ZoomInIcon
                                  height={16}
                                  width={16}
                                  color={magnifierMode > 0 ? "orange" : "white"}
                                />
                              </Button>
                              <DirectedLinksToggleButton
                                isDirectedLinks={isDirectedLinks}
                                setIsDirectedLinks={setIsDirectedLinks}
                              />
                            </div>
                          }
                          focusedLink={undefined}
                          isLargeGraph={false}
                          isEditor={false}
                          magnifierMode={magnifierMode}
                          isSelectionMode={false}
                          onNodeSelectionToggle={() => {
                            // 選択モードは使用しない
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <p>グラフデータが見つかりません</p>
                    </div>
                  )}
                  <div
                    ref={resizeHandleRef}
                    onMouseDown={handleResizeMouseDown}
                    onTouchStart={handleResizeTouchStart}
                    onDoubleClick={handleResizeDoubleClick}
                    style={{
                      position: "absolute",
                      left: "-12px",
                      bottom: "-12px",
                      width: "24px",
                      height: "24px",
                      backgroundColor: "gray",
                      border: "2px solid darkgray",
                      cursor: "nesw-resize",
                      zIndex: 10,
                      rotate: "45deg",
                      touchAction: "none", // タッチイベントのデフォルト動作を無効化
                    }}
                  />
                </div>
              </>
            ) : (
              <Button size="small" onClick={() => setIsGraphVisible(true)}>
                <MapIcon width={16} height={16} color="white" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
