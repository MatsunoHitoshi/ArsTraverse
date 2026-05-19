import { createId } from "@paralleldrive/cuid2";
import { PrismaClient } from "@prisma/client";

export const testDb = new PrismaClient();

export function hasTestDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function canConnectToTestDatabase(): Promise<boolean> {
  if (!hasTestDatabase()) return false;
  try {
    await testDb.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function createTestTopicSpace(namePrefix = "pw-kg-test") {
  return testDb.topicSpace.create({
    data: {
      name: `${namePrefix}-${createId()}`,
      description: "Playwright KG integration test",
    },
  });
}

export async function deleteTestTopicSpace(topicSpaceId: string) {
  await testDb.graphRelationship.deleteMany({ where: { topicSpaceId } });
  await testDb.graphNode.deleteMany({ where: { topicSpaceId } });
  await testDb.topicSpace.delete({ where: { id: topicSpaceId } });
}

export async function seedTopicSpaceGraph(topicSpaceId: string) {
  const nodeAId = createId();
  const nodeBId = createId();
  const nodeCId = createId();
  const edgeABId = createId();
  const edgeBCId = createId();

  await testDb.graphNode.createMany({
    data: [
      {
        id: nodeAId,
        name: "NodeA",
        label: "Entity",
        properties: {},
        topicSpaceId,
      },
      {
        id: nodeBId,
        name: "NodeB",
        label: "Entity",
        properties: {},
        topicSpaceId,
      },
      {
        id: nodeCId,
        name: "NodeC",
        label: "Entity",
        properties: {},
        topicSpaceId,
      },
    ],
  });

  await testDb.graphRelationship.createMany({
    data: [
      {
        id: edgeABId,
        type: "RELATED_TO",
        properties: {},
        fromNodeId: nodeAId,
        toNodeId: nodeBId,
        topicSpaceId,
      },
      {
        id: edgeBCId,
        type: "RELATED_TO",
        properties: {},
        fromNodeId: nodeBId,
        toNodeId: nodeCId,
        topicSpaceId,
      },
    ],
  });

  return { nodeAId, nodeBId, nodeCId, edgeABId, edgeBCId };
}
