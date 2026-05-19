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

const TEST_ADMIN_EMAIL = "pw-kg-admin@test.local";

export async function getOrCreateTestAdminUser() {
  return testDb.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    create: {
      email: TEST_ADMIN_EMAIL,
      name: "PW KG Test Admin",
    },
    update: {},
  });
}

export async function createTestTopicSpaceWithAdmin(namePrefix = "pw-kg-test") {
  const user = await getOrCreateTestAdminUser();
  const topicSpace = await createTestTopicSpace(namePrefix);
  await testDb.topicSpace.update({
    where: { id: topicSpace.id },
    data: { admins: { connect: { id: user.id } } },
  });
  return { topicSpace, userId: user.id };
}

export async function deleteTestTopicSpace(topicSpaceId: string) {
  const histories = await testDb.graphChangeHistory.findMany({
    where: { recordId: topicSpaceId },
    select: { id: true },
  });
  if (histories.length > 0) {
    await testDb.nodeLinkChangeHistory.deleteMany({
      where: {
        graphChangeHistoryId: { in: histories.map((h) => h.id) },
      },
    });
    await testDb.graphChangeHistory.deleteMany({
      where: { recordId: topicSpaceId },
    });
  }

  await testDb.graphEditProposal.deleteMany({ where: { topicSpaceId } });
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

export async function createTestDocumentGraph(userId: string) {
  const doc = await testDb.sourceDocument.create({
    data: {
      name: `pw-kg-doc-${createId()}`,
      url: "https://example.com/kg-test",
      userId,
    },
  });
  const documentGraph = await testDb.documentGraph.create({
    data: {
      sourceDocumentId: doc.id,
      userId,
      dataJson: {},
    },
  });
  return { documentGraph, sourceDocument: doc };
}

export async function deleteTestDocumentGraph(
  documentGraphId: string,
  sourceDocumentId: string,
) {
  const histories = await testDb.graphChangeHistory.findMany({
    where: { recordId: documentGraphId },
    select: { id: true },
  });
  if (histories.length > 0) {
    await testDb.nodeLinkChangeHistory.deleteMany({
      where: {
        graphChangeHistoryId: { in: histories.map((h) => h.id) },
      },
    });
    await testDb.graphChangeHistory.deleteMany({
      where: { recordId: documentGraphId },
    });
  }

  await testDb.graphRelationship.deleteMany({ where: { documentGraphId } });
  await testDb.graphNode.deleteMany({ where: { documentGraphId } });
  await testDb.documentGraph.delete({ where: { id: documentGraphId } });
  await testDb.sourceDocument.delete({ where: { id: sourceDocumentId } });
}

export async function seedDocumentGraph(documentGraphId: string) {
  const nodeAId = createId();
  const nodeBId = createId();
  const nodeCId = createId();
  const edgeABId = createId();
  const edgeBCId = createId();

  await testDb.graphNode.createMany({
    data: [
      {
        id: nodeAId,
        name: "DocNodeA",
        label: "Entity",
        properties: {},
        documentGraphId,
      },
      {
        id: nodeBId,
        name: "DocNodeB",
        label: "Entity",
        properties: {},
        documentGraphId,
      },
      {
        id: nodeCId,
        name: "DocNodeC",
        label: "Entity",
        properties: {},
        documentGraphId,
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
        documentGraphId,
      },
      {
        id: edgeBCId,
        type: "RELATED_TO",
        properties: {},
        fromNodeId: nodeBId,
        toNodeId: nodeCId,
        documentGraphId,
      },
    ],
  });

  return { nodeAId, nodeBId, nodeCId, edgeABId, edgeBCId };
}
