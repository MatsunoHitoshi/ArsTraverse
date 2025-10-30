import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import { D3ZoomProvider } from "../zoom";
import type { ClusteringResult, ClusterResult } from "@/app/const/types";
import type { JsonValue } from "@prisma/client/runtime/library";

interface AnnotationMapD3VisualizationProps {
  clusteringResult: ClusteringResult;
  currentScale: number;
  setCurrentScale: React.Dispatch<React.SetStateAction<number>>;
  currentTransformX: number;
  setCurrentTransformX: React.Dispatch<React.SetStateAction<number>>;
  currentTransformY: number;
  setCurrentTransformY: React.Dispatch<React.SetStateAction<number>>;
  selectedClusterId: number | null;
  onClusterClick: (clusterId: number) => void;
  width: number;
  height: number;
  annotations?: Array<{
    id: string;
    content: JsonValue;
    type: string;
    author: { name: string | null };
    createdAt: Date;
  }>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  // 階層関係データ
  hierarchy?: {
    currentAnnotationId: string;
    parentAnnotationId?: string | null;
    childAnnotationIds: string[];
  };
}

export function AnnotationMapD3Visualization({
  clusteringResult,
  currentScale,
  setCurrentScale,
  currentTransformX,
  setCurrentTransformX,
  currentTransformY,
  setCurrentTransformY,
  selectedClusterId,
  selectedAnnotationId,
  setSelectedAnnotationId,
  onClusterClick,
  width,
  height,
  annotations = [],
  hierarchy,
}: AnnotationMapD3VisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !clusteringResult) return;

    const svg = d3.select(svgRef.current);

    // blurフィルターを定義
    const defs = svg.select("defs").empty()
      ? svg.append("defs")
      : svg.select("defs");
    defs.select("#blurFilter").remove(); // 既存のフィルターを削除
    defs
      .append("filter")
      .attr("id", "blurFilter")
      .append("feGaussianBlur")
      .attr("stdDeviation", 10);

    // cluster-visualization-wrapper内の要素のみをクリア
    const wrapper = svg.select(".cluster-visualization-wrapper");
    wrapper.selectAll("*").remove();

    // ズーム可能なグループ要素を作成
    const zoomGroup = wrapper.append("g").attr("class", "zoom-group");

    // ズーム変換をグループ要素に適用
    zoomGroup.attr(
      "transform",
      `translate(${currentTransformX}, ${currentTransformY}) scale(${currentScale})`,
    );

    // スケールを設定
    const innerWidth = width;
    const innerHeight = height;

    // クラスターと座標の両方を考慮したスケール設定
    const clusters = clusteringResult.clusters ?? [];
    const coordinates = clusteringResult.coordinates ?? [];

    if (clusters.length === 0 && coordinates.length === 0) return;

    // クラスターの中心座標と個別注釈の座標を統合してスケールを計算
    const allXValues = [
      ...clusters.map((d) => d.centerX),
      ...coordinates.map((d) => d.x),
    ];
    const allYValues = [
      ...clusters.map((d) => d.centerY),
      ...coordinates.map((d) => d.y),
    ];

    const xExtent = d3.extent(allXValues) as [number, number];
    const yExtent = d3.extent(allYValues) as [number, number];

    const xScale = d3.scaleLinear().domain(xExtent).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain(yExtent).range([0, innerHeight]);

    // サイズスケール
    const sizeScale = d3
      .scaleSqrt()
      .domain(d3.extent(clusters, (d) => d.size) as [number, number])
      .range([20, 80]);

    // カラースケール
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // ツールチップをコンテナ内に作成
    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "rgba(0, 0, 0, 0.8)")
      .style("color", "white")
      .style("padding", "8px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", "1000")
      .style("left", "0px")
      .style("top", "0px");

    // クラスターを描画
    const clusterGroups = zoomGroup
      .selectAll(".cluster")
      .data(clusters)
      .enter()
      .append("g")
      .attr("class", "cluster")
      .attr(
        "transform",
        (d) => `translate(${xScale(d.centerX)}, ${yScale(d.centerY)})`,
      );

    // クラスター円（動的半径設定）
    clusterGroups
      .append("circle")
      .attr("filter", "url(#blurFilter)")
      .attr("r", (d) => {
        // このクラスターに属する注釈の座標を取得
        const clusterCoordinates = coordinates.filter((coord) =>
          d.annotationIds.includes(coord.annotationId),
        );

        if (clusterCoordinates.length === 0) {
          // 座標がない場合はデフォルトサイズ
          return sizeScale(d.size);
        } else if (clusterCoordinates.length === 1) {
          // 1つの注釈の場合は現在の設定を維持
          return sizeScale(d.size);
        } else {
          // 複数の注釈がある場合は、それらを包含する半径を計算
          const maxDistance = Math.max(
            ...clusterCoordinates.map((coord) => {
              const dx = coord.x - d.centerX;
              const dy = coord.y - d.centerY;
              return Math.sqrt(dx * dx + dy * dy);
            }),
          );
          // データ座標系での距離を画面座標系に変換
          const dataRangeX = xExtent[1] - xExtent[0];
          const dataRangeY = yExtent[1] - yExtent[0];
          const avgDataRange = (dataRangeX + dataRangeY) / 2;
          const avgScreenRange = (innerWidth + innerHeight) / 2;
          const scaleFactor = avgScreenRange / avgDataRange;
          return maxDistance * scaleFactor * 1.1;
        }
      })
      .attr("fill", (d, i) => colorScale(i.toString()))
      .attr("fill-opacity", (d) =>
        selectedClusterId === d.clusterId ? 0.45 : 0.1,
      )
      .attr("stroke", (d, i) => colorScale(i.toString()))
      .attr("stroke-width", (d) => (selectedClusterId === d.clusterId ? 3 : 2))
      .attr("stroke-opacity", 0.6)
      .style("cursor", "pointer")
      .on("click", function (event: MouseEvent, d: ClusterResult) {
        event.stopPropagation();
        onClusterClick(d.clusterId);
      });

    // クラスタータイトルラベル
    clusterGroups
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.8em")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .attr("fill", "white")
      .text((d) => d.title ?? `C${d.clusterId}`);

    // クラスターサイズラベル
    clusterGroups
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.4em")
      .attr("font-size", "10px")
      .attr("fill", "white")
      .text((d) => `${d.size}`);

    // 個別の注釈を表示（座標情報がある場合）
    if (coordinates.length > 0) {
      const annotationPoints = zoomGroup
        .selectAll(".annotation-point")
        .data(coordinates)
        .enter()
        .append("g")
        .attr("class", "annotation-point")
        .attr("transform", (d) => `translate(${xScale(d.x)}, ${yScale(d.y)})`);

      // 注釈の点を描画（クラスターに属する場合はクラスターの色を使用）
      annotationPoints
        .append("circle")
        .attr("r", (d) => {
          // currentAnnotationIdの場合は大きく表示
          if (hierarchy?.currentAnnotationId === d.annotationId) {
            return 8;
          }
          // 親子関係の注釈は少し大きく表示
          if (
            hierarchy?.parentAnnotationId === d.annotationId ||
            hierarchy?.childAnnotationIds.includes(d.annotationId)
          ) {
            return 6;
          }
          return 4;
        })
        .attr("fill", (d) => {
          // この注釈がどのクラスターに属するかを確認
          const cluster = clusters.find((c) =>
            c.annotationIds.includes(d.annotationId),
          );
          return cluster ? colorScale(cluster.clusterId.toString()) : "white";
        })
        .attr("fill-opacity", (d) => {
          // currentAnnotationIdの場合は不透明度を上げる
          if (hierarchy?.currentAnnotationId === d.annotationId) {
            return 1.0;
          }
          // 親子関係の注釈も少し不透明度を上げる
          if (
            hierarchy?.parentAnnotationId === d.annotationId ||
            hierarchy?.childAnnotationIds.includes(d.annotationId)
          ) {
            return 0.9;
          }
          return 0.8;
        })
        .attr("stroke", (d) => {
          const cluster = clusters.find((c) =>
            c.annotationIds.includes(d.annotationId),
          );
          // 選択されているアノテーションは強調
          if (selectedAnnotationId === d.annotationId) {
            return "orange";
          }
          // 階層関係の注釈は白い境界線で統一
          if (
            hierarchy?.currentAnnotationId === d.annotationId ||
            hierarchy?.parentAnnotationId === d.annotationId ||
            hierarchy?.childAnnotationIds.includes(d.annotationId)
          ) {
            return "white";
          }
          return cluster ? colorScale(cluster.clusterId.toString()) : "gray";
        })
        .attr("stroke-width", (d) => {
          // 選択されているアノテーションは太い境界線
          return selectedAnnotationId === d.annotationId ? 3 : 1;
        })
        .style("cursor", "pointer")
        .on("click", function (event: MouseEvent, d) {
          event.stopPropagation();
          setSelectedAnnotationId(d.annotationId);
        });

      // 現在の注釈にパルスアニメーションを追加
      annotationPoints
        .filter((d) => hierarchy?.currentAnnotationId === d.annotationId)
        .append("circle")
        .attr("r", 8)
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr("opacity", 0.6)
        .style("pointer-events", "none")
        .transition()
        .duration(1500)
        .ease(d3.easeLinear)
        .attr("r", 18)
        .attr("opacity", 0)
        .on("end", function () {
          const element = d3.select(this);
          const pulseAnimation = () => {
            element
              .attr("r", 8)
              .attr("opacity", 0.6)
              .transition()
              .duration(1500)
              .ease(d3.easeLinear)
              .attr("r", 18)
              .attr("opacity", 0)
              .on("end", pulseAnimation);
          };
          pulseAnimation();
        });

      //  // 親子関係の注釈に点線の境界線を追加
      //   annotationPoints
      //     .filter(
      //       (d) =>
      //         hierarchy?.parentAnnotationId === d.annotationId ||
      //         (hierarchy?.childAnnotationIds.includes(d.annotationId) ?? false),
      //     )
      //     .append("circle")
      //     .attr("r", (d) => {
      //       if (hierarchy?.parentAnnotationId === d.annotationId) {
      //         return 6;
      //       }
      //       if (hierarchy?.childAnnotationIds.includes(d.annotationId)) {
      //         return 6;
      //       }
      //       return 4;
      //     })
      //     .attr("fill", "none")
      //     .attr("stroke", "white")
      //     .attr("stroke-width", 2)
      //     .attr("stroke-dasharray", "3,3")
      //     .attr("opacity", 0.8)
      //     .style("pointer-events", "none");

      // 注釈のツールチップ
      annotationPoints
        .on("mouseover", function (event: MouseEvent, d) {
          const containerRect = containerRef.current!.getBoundingClientRect();
          const mouseX = event.clientX - containerRect.left;
          const mouseY = event.clientY - containerRect.top;

          // 対応する注釈データを取得
          const annotation = annotations.find((a) => a.id === d.annotationId);
          const cluster = clusters.find((c) =>
            c.annotationIds.includes(d.annotationId),
          );

          tooltip.transition().duration(200).style("opacity", 0.9);
          tooltip
            .html(
              `
              <div>
                ${cluster ? `グループ: ${cluster.title ?? `C${cluster.clusterId}`}<br/>` : ""}
                ${
                  annotation
                    ? `
                  タイプ: ${annotation.type}<br/>
                  作成者: ${annotation.author.name ?? "不明"}<br/>
                  作成日: ${new Date(annotation.createdAt).toLocaleDateString()}
                `
                    : ""
                }
              </div>
            `,
            )
            .style("left", mouseX + 10 + "px")
            .style("top", mouseY - 10 + "px");
        })
        .on("mouseout", function () {
          tooltip.transition().duration(200).style("opacity", 0);
        });
    }

    // 親子関係の線を描画
    const drawHierarchyLinks = () => {
      if (!hierarchy) return;

      // 親子関係のリンクデータを作成
      const hierarchyLinks: Array<{
        source: { x: number; y: number; annotationId: string };
        target: { x: number; y: number; annotationId: string };
      }> = [];

      // 現在の注釈と親注釈の関係
      if (hierarchy.parentAnnotationId) {
        const parentCoord = coordinates.find(
          (coord) => coord.annotationId === hierarchy.parentAnnotationId!,
        );
        const currentCoord = coordinates.find(
          (coord) => coord.annotationId === hierarchy.currentAnnotationId,
        );

        if (parentCoord && currentCoord) {
          hierarchyLinks.push({
            source: parentCoord,
            target: currentCoord,
          });
        }
      }

      // 現在の注釈と子注釈の関係
      hierarchy.childAnnotationIds.forEach((childId) => {
        const childCoord = coordinates.find(
          (coord) => coord.annotationId === childId,
        );
        const currentCoord = coordinates.find(
          (coord) => coord.annotationId === hierarchy.currentAnnotationId,
        );

        if (childCoord && currentCoord) {
          hierarchyLinks.push({
            source: currentCoord,
            target: childCoord,
          });
        }
      });

      // 親子関係の線を描画
      if (hierarchyLinks.length > 0) {
        const hierarchyLinkGroup = zoomGroup
          .append("g")
          .attr("class", "hierarchy-links");

        hierarchyLinkGroup
          .selectAll(".hierarchy-link")
          .data(hierarchyLinks)
          .enter()
          .append("line")
          .attr("class", "hierarchy-link")
          .attr("x1", (d) => xScale(d.source.x))
          .attr("y1", (d) => yScale(d.source.y))
          .attr("x2", (d) => xScale(d.target.x))
          .attr("y2", (d) => yScale(d.target.y))
          .attr("stroke", "white") // オレンジ色
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.4)
          .attr("stroke-dasharray", "5,5") // 破線
          .style("pointer-events", "none");

        // 親子関係の矢印を描画
        const arrowhead = hierarchyLinkGroup
          .append("defs")
          .append("marker")
          .attr("id", "hierarchy-arrow")
          .attr("viewBox", "0 -5 10 10")
          .attr("refX", 8)
          .attr("refY", 0)
          .attr("markerWidth", 6)
          .attr("markerHeight", 6)
          .attr("orient", "auto");

        arrowhead
          .append("path")
          .attr("d", "M0,-5L10,0L0,5")
          .attr("fill", "white")
          .attr("opacity", 0.4);

        // 線に矢印を追加
        hierarchyLinkGroup
          .selectAll(".hierarchy-link")
          .attr("marker-end", "url(#hierarchy-arrow)");
      }
    };

    // 親子関係の線を描画
    drawHierarchyLinks();

    clusterGroups
      .on("mouseover", function (event: MouseEvent, d) {
        // コンテナ内での相対位置を計算
        const containerRect = containerRef.current!.getBoundingClientRect();
        const mouseX = event.clientX - containerRect.left;
        const mouseY = event.clientY - containerRect.top;

        tooltip.transition().duration(200).style("opacity", 0.9);
        tooltip
          .html(
            `
            <div>
              <strong>グループ: ${d.title ?? `C${d.clusterId}`}</strong><br/>
              サイズ: ${d.size}件<br/>
              アルゴリズム: ${clusteringResult.algorithm}<br/>
              ${d.features?.dominantType ? `主要タイプ: ${d.features.dominantType}<br/>` : ""}
              ${d.features?.avgSentiment ? `平均感情: ${d.features.avgSentiment.toFixed(2)}<br/>` : ""}
            </div>
          `,
          )
          .style("left", mouseX + 10 + "px")
          .style("top", mouseY - 10 + "px");
      })
      .on("mouseout", function () {
        tooltip.transition().duration(200).style("opacity", 0);
      });

    // クリーンアップ関数
    return () => {
      tooltip.remove();
    };
  }, [
    clusteringResult,
    currentScale,
    currentTransformX,
    currentTransformY,
    selectedClusterId,
    selectedAnnotationId,
    setSelectedAnnotationId,
    onClusterClick,
    height,
    width,
    annotations,
    hierarchy,
  ]);

  return (
    <div ref={containerRef} className="relative flex flex-col">
      <div className={`h-[${String(height)}px] w-[${String(width)}px]`}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="overflow-hidden"
          viewBox={`0 0 ${String(width)} ${String(height)}`}
        >
          <D3ZoomProvider
            svgRef={svgRef}
            setCurrentScale={setCurrentScale}
            setCurrentTransformX={setCurrentTransformX}
            setCurrentTransformY={setCurrentTransformY}
            currentScale={currentScale}
            currentTransformX={currentTransformX}
            currentTransformY={currentTransformY}
          >
            <g
              className="cluster-visualization-wrapper"
              width={width}
              height={height}
            ></g>
          </D3ZoomProvider>
        </svg>
      </div>
    </div>
  );
}
