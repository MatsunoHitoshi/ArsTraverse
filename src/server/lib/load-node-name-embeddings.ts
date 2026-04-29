import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/** pgvector の text 表現（例: `[0.1,0.2,...]`）を float 配列にする */
export function parsePgVectorText(raw: string): number[] {
  const t = raw.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1);
    if (!inner) return [];
    return inner.split(",").map((x) => parseFloat(x.trim()));
  }
  return [];
}

/**
 * TopicSpace 内の指定ノードについて nameEmbedding を取得する。
 * ::float[] が使えない Postgres の場合は ::text で返し parse する。
 */
export async function loadNodeNameEmbeddingsForTopicSpace(
  db: PrismaClient,
  topicSpaceId: string,
  nodeIds: string[],
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (nodeIds.length === 0) return map;

  try {
    const rows = await db.$queryRaw<
      Array<{ id: string; vec: unknown }>
    >`
      SELECT g.id, (g."nameEmbedding"::float[]) AS vec
      FROM "GraphNode" g
      WHERE g."topicSpaceId" = ${topicSpaceId}
        AND g."deletedAt" IS NULL
        AND g."nameEmbedding" IS NOT NULL
        AND g.id IN (${Prisma.join(nodeIds)})
    `;
    for (const row of rows) {
      if (Array.isArray(row.vec)) {
        const nums = row.vec.map((x) => Number(x));
        if (nums.length > 0 && nums.every((n) => !Number.isNaN(n))) {
          map.set(row.id, nums);
        }
      }
    }
    if (map.size > 0) return map;
  } catch {
    // float[] キャスト非対応時は text 経由
  }

  const rowsText = await db.$queryRaw<
    Array<{ id: string; vec: string | null }>
  >`
    SELECT g.id, g."nameEmbedding"::text AS vec
    FROM "GraphNode" g
    WHERE g."topicSpaceId" = ${topicSpaceId}
      AND g."deletedAt" IS NULL
      AND g."nameEmbedding" IS NOT NULL
      AND g.id IN (${Prisma.join(nodeIds)})
  `;
  for (const row of rowsText) {
    if (row.vec) {
      const parsed = parsePgVectorText(row.vec);
      if (parsed.length > 0) map.set(row.id, parsed);
    }
  }
  return map;
}
