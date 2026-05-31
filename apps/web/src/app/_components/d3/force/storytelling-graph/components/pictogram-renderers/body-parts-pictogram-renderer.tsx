"use client";

/**
 * BodyPartsPictogramRenderer — 案2: SVGパーツ分割型ピクトグラム（将来実装）
 *
 * DancingBoard (IUI 2025) の「頭・右腕・左腕・体足」分割アプローチに基づき、
 * 人物SVGのパーツごとに `transform-origin` を関節位置に設定して
 * CDTカテゴリ別の動作（腕の往復、足の交互動作など）を表現する。
 *
 * --- 実装方針 ---
 * - `<g id="head">`, `<g id="right-arm">`, `<g id="left-arm">`, `<g id="body-legs">` に分割
 * - 各パーツの `transform-origin` を関節座標（肩/首の付け根）に設定
 * - GSAP または Web Animations API で CDTカテゴリに応じた角度・周期を設定
 *
 * --- CDTカテゴリ別 動作設計 ---
 * | カテゴリ | 動かすパーツ        | 動作                          |
 * | -------- | ------------------- | ----------------------------- |
 * | PTRANS   | 体全体              | 水平スライド (translateX)      |
 * | ATRANS   | 右腕               | ゆっくり前に伸ばす              |
 * | PROPEL   | 右腕（高速往復）    | ±30deg、高速 yoyo              |
 * | MOVE     | 左右の足           | 交互に ±20deg                  |
 * | INGEST   | 左右の腕           | 両腕を内側に収束                |
 * | EXPEL    | 左右の腕           | 両腕を外側に放散                |
 * | SPEAK    | 頭（うなずき）      | 前後±10deg                    |
 * | MENTAL   | 頭（ゆっくり揺れ） | ±5deg、ゆっくり                |
 *
 * --- 追加作業（将来実装時）---
 * 1. 人物SVGアセット（head/right-arm/left-arm/body-legs 分割済み）を用意
 * 2. `gsap` パッケージを追加: `npm install gsap`
 * 3. 下記の TODO を実装する
 *
 * 現在は `IconPictogramRenderer` へのフォールバックとして使用される（シグネチャのみ）。
 */

import { IconPictogramRenderer } from "../edge-semantic-pictogram";
import type { PictogramRendererProps } from "../edge-semantic-pictogram";

export function BodyPartsPictogramRenderer(props: PictogramRendererProps) {
  // TODO: SVGパーツ分割型ピクトグラムの実装
  //
  // 実装例（PROPEL カテゴリの場合）:
  // const rightArmRef = useRef<SVGGElement>(null);
  // useEffect(() => {
  //   if (!rightArmRef.current || props.config.category !== "PROPEL") return;
  //   const intensity = props.config.speed * 30; // 最大 30度
  //   // GSAP を使用する場合:
  //   // gsap.to(rightArmRef.current, {
  //   //   rotation: intensity,
  //   //   duration: 1 / props.config.speed,
  //   //   repeat: -1,
  //   //   yoyo: true,
  //   //   transformOrigin: "12px 20px", // 肩の付け根座標
  //   // });
  //   // Web Animations API を使用する場合:
  //   // rightArmRef.current.animate(
  //   //   [{ transform: `rotate(-${intensity}deg)` }, { transform: `rotate(${intensity}deg)` }],
  //   //   { duration: 1000 / props.config.speed, iterations: Infinity, direction: "alternate" }
  //   // );
  // }, [props.config]);
  //
  // return (
  //   <svg viewBox="0 0 24 24" width={props.size} height={props.size}>
  //     <g id="head" style={{ transformOrigin: "12px 4px" }}>
  //       {/* 頭部パス */}
  //     </g>
  //     <g id="body-legs" style={{ transformOrigin: "12px 12px" }}>
  //       {/* 胴体・足パス */}
  //     </g>
  //     <g ref={rightArmRef} id="right-arm" style={{ transformOrigin: "12px 10px" }}>
  //       {/* 右腕パス */}
  //     </g>
  //     <g id="left-arm" style={{ transformOrigin: "12px 10px" }}>
  //       {/* 左腕パス */}
  //     </g>
  //   </svg>
  // );

  // フォールバック: 実装完了まで IconPictogramRenderer を使用
  return <IconPictogramRenderer {...props} />;
}
