import type { CustomNodeType } from "@/app/const/types";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3";
import type { CustomLinkType } from "@/app/const/types";

/**
 * 球面座標（緯度、経度）から3D座標（x, y, z）に変換
 */
export function sphericalToCartesian(
  radius: number,
  theta: number, // 緯度（-π/2 から π/2）
  phi: number, // 経度（0 から 2π）
): [number, number, number] {
  const x = radius * Math.cos(theta) * Math.cos(phi);
  const y = radius * Math.sin(theta);
  const z = radius * Math.cos(theta) * Math.sin(phi);
  return [x, y, z];
}

/**
 * 2D座標（x, y）を球面上の3D座標に投影
 * 中心点を基準に、球面上に均等に配置
 * より均等な分布を得るために、距離を平方根スケールで変換して使用
 */
export function projectToSphere(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radius: number,
): [number, number, number] {
  // 中心からの距離と角度を計算
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 2D空間の最大距離を推定（画面の対角線の半分）
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

  // 正規化された距離（0から1）
  const normalizedDistance =
    maxDistance > 0 ? Math.min(distance / maxDistance, 1) : 0;

  // より均等な分布のために、距離を平方根スケールに変換
  // これにより、中心付近のノードも球面上に広く分布する
  // 平方根変換により、中心付近の密度を下げて分散を促進
  const sqrtScale = Math.sqrt(normalizedDistance);

  // 緯度: -π/2 から π/2 にマッピング
  // 平方根スケールを使用することで、より均等な分布を得る
  const theta = (sqrtScale - 0.5) * Math.PI;
  // 経度: 0 から 2π
  const phi = Math.atan2(dy, dx);

  return sphericalToCartesian(radius, theta, phi);
}

/**
 * 球面螺旋配置（Fibonacci sphere）を使用してノードを均等に配置
 * より均等な分布を得るためのアルゴリズム
 */
function fibonacciSpherePoint(
  index: number,
  total: number,
  radius: number,
): [number, number, number] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // 黄金角

  // 球面上の均等な分布を生成
  const y = 1 - (index / (total - 1)) * 2; // -1 から 1 にマッピング
  const radius_at_y = Math.sqrt(1 - y * y);
  const theta = goldenAngle * index;

  const x = Math.cos(theta) * radius_at_y;
  const z = Math.sin(theta) * radius_at_y;

  return [x * radius, y * radius, z * radius];
}

/**
 * D3.jsのforce simulationを使ってノードを配置し、球面上に投影
 * ノードをコピーしてシミュレーションを実行し、元のノードを変更しないようにする
 */
export function layoutNodesOnSphere(
  nodes: CustomNodeType[],
  links: CustomLinkType[],
  radius: number,
  width: number,
  height: number,
): Map<string, [number, number, number]> {
  const centerX = width / 2;
  const centerY = height / 2;

  // ノードをコピーしてシミュレーションを実行（元のノードを変更しない）
  const nodesCopy = nodes.map((node) => ({
    ...node,
    x: node.x ?? centerX,
    y: node.y ?? centerY,
    vx: 0,
    vy: 0,
  }));

  // D3.jsのforce simulationで2D配置を計算
  // ノードがより広く分散するようにパラメータを調整
  const simulation = forceSimulation<CustomNodeType>(nodesCopy)
    .force(
      "link",
      forceLink<CustomNodeType, CustomLinkType>(links)
        .id((d) => d.id)
        .distance(60) // 距離を増やしてノード間の間隔を広げる
        .strength(0.2), // 強度を上げてリンクを維持
    )
    .force("center", forceCenter(centerX, centerY).strength(0.05)) // 中心への引力をさらに弱める
    .force("charge", forceManyBody().strength(-120)) // 反発力をさらに強めて分散を促進
    .force("collision", forceCollide(5)) // 衝突半径を大きくして重なりを防ぐ
    .stop();

  // シミュレーションを実行（より多くのイテレーションで安定した配置を得る）
  for (let i = 0; i < 500; ++i) {
    simulation.tick();
  }

  // 2D座標から中心からの角度と距離を計算
  const nodeData = nodesCopy.map((node) => {
    if (node.x === undefined || node.y === undefined) {
      return { node, distance: 0, angle: 0 };
    }
    const dx = node.x - centerX;
    const dy = node.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    return { node, distance, angle };
  });

  // 距離でソートして、遠いノードから順に球面上に配置
  nodeData.sort((a, b) => b.distance - a.distance);

  // 球面上の3D座標に投影
  // より均等な分布のために、距離を球面上の角度に適切にマッピング
  const positionMap = new Map<string, [number, number, number]>();
  const maxDistance = Math.max(
    ...nodeData.map((d) => d.distance),
    Math.sqrt(centerX * centerX + centerY * centerY),
  );

  // 距離の分布を分析して、より均等なマッピングを生成
  const distances = nodeData.map((d) => d.distance).filter((d) => d > 0);
  const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
  const distanceRange = maxDistance - minDistance;

  // ノードのIDからインデックスへのマッピング
  const nodeIndexMap = new Map<string, number>();
  nodes.forEach((node, idx) => {
    nodeIndexMap.set(node.id, idx);
  });

  // 各ノードのリンク数を計算（グラフの構造を考慮）
  const linkCountMap = new Map<string, number>();
  links.forEach((link) => {
    const sourceId =
      typeof link.source === "object" &&
      link.source !== null &&
      "id" in link.source
        ? link.source.id
        : link.sourceId;
    const targetId =
      typeof link.target === "object" &&
      link.target !== null &&
      "id" in link.target
        ? link.target.id
        : link.targetId;

    linkCountMap.set(sourceId, (linkCountMap.get(sourceId) ?? 0) + 1);
    linkCountMap.set(targetId, (linkCountMap.get(targetId) ?? 0) + 1);
  });

  // ノードをリンク数でソート（リンク数の多いノードを優先的に配置）
  const sortedNodeData = [...nodeData].sort((a, b) => {
    const aLinks = linkCountMap.get(a.node.id) ?? 0;
    const bLinks = linkCountMap.get(b.node.id) ?? 0;
    return bLinks - aLinks; // リンク数の多い順
  });

  // 球面上に均等に配置（リンク数を考慮）
  sortedNodeData.forEach(({ node, distance, angle }, sortedIndex) => {
    // 距離を正規化
    const normalizedDistance =
      distanceRange > 0 ? (distance - minDistance) / distanceRange : 0.5;

    // 順位を正規化（リンク数ベース）
    const normalizedRank = sortedIndex / Math.max(nodes.length - 1, 1);

    // 距離と順位を組み合わせて、より均等な分布を得る
    // 距離の影響を弱め（0.15）、順位の影響を強める（0.85）
    const combinedScale = normalizedDistance * 0.15 + normalizedRank * 0.85;

    // 緯度: -π/2 から π/2 に均等にマッピング
    const theta = (combinedScale - 0.5) * Math.PI;

    // 経度: 2D空間の角度を保持しつつ、順位ベースの補正を追加
    // これにより、同じ角度のノードが重ならないようにする
    const phi = angle + normalizedRank * Math.PI * 1.5;

    const [x, y, z] = sphericalToCartesian(radius, theta, phi);
    positionMap.set(node.id, [x, y, z]);
  });

  return positionMap;
}

/**
 * 球面上の2点間の大円弧を計算（曲線の制御点を生成）
 */
export function getGreatCircleArc(
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  segments = 20,
): [number, number, number][] {
  const points: [number, number, number][] = [];

  // ベクトルを正規化して単位ベクトルに変換（SLERPのため）
  const length1 = Math.sqrt(
    start[0] * start[0] + start[1] * start[1] + start[2] * start[2],
  );
  const length2 = Math.sqrt(
    end[0] * end[0] + end[1] * end[1] + end[2] * end[2],
  );

  if (length1 === 0 || length2 === 0) {
    // 無効なベクトルの場合
    return [start, end];
  }

  const v1: [number, number, number] = [
    start[0] / length1,
    start[1] / length1,
    start[2] / length1,
  ];
  const v2: [number, number, number] = [
    end[0] / length2,
    end[1] / length2,
    end[2] / length2,
  ];

  // 球面線形補間（SLERP）の角度を計算
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));

  if (Math.abs(theta) < 0.001) {
    // ほぼ同じ点の場合
    return [start, end];
  }

  const sinTheta = Math.sin(theta);

  // 球面上の2点間の大円弧を計算
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;

    // SLERPの重みを計算
    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;

    // 単位ベクトルで補間
    const x = w1 * v1[0] + w2 * v2[0];
    const y = w1 * v1[1] + w2 * v2[1];
    const z = w1 * v1[2] + w2 * v2[2];

    // 半径を掛けて球面上の位置に戻す
    points.push([x * radius, y * radius, z * radius]);
  }

  return points;
}
