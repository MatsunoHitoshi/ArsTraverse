import type { Prisma, PrismaClient, WorkspaceStatus } from "@prisma/client";
import {
  recordWritingHistoryIfNeeded,
  tiptapPlainTextPreview,
} from "./writing-history";
import { PUBLIC_USER_SELECT } from "@/server/lib/user-select";

function accessibleByUser(userId: string) {
  return {
    OR: [
      { userId },
      { collaborators: { some: { id: userId } } },
    ],
  };
}

export type ExternalWorkspaceDto = {
  id: string;
  source: string | null;
  sourceKey: string | null;
  name: string;
  description: string | null;
  status: WorkspaceStatus;
  content: unknown;
  curatorialContext: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ExternalWritingHistoryDto = {
  id: string;
  workspaceId: string;
  changeDescription: string | null;
  preview: string;
  previousPreview: string;
  createdAt: string;
  changedBy: { id: string; name: string | null; image: string | null };
};

function toIso(value: Date): string {
  return value.toISOString();
}

function toDto(workspace: {
  id: string;
  source: string | null;
  sourceKey: string | null;
  name: string;
  description: string | null;
  status: WorkspaceStatus;
  content: Prisma.JsonValue;
  curatorialContext: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): ExternalWorkspaceDto {
  return {
    id: workspace.id,
    source: workspace.source,
    sourceKey: workspace.sourceKey,
    name: workspace.name,
    description: workspace.description,
    status: workspace.status,
    content: workspace.content,
    curatorialContext: workspace.curatorialContext,
    createdAt: toIso(workspace.createdAt),
    updatedAt: toIso(workspace.updatedAt),
  };
}

const workspaceSelect = {
  id: true,
  source: true,
  sourceKey: true,
  name: true,
  description: true,
  status: true,
  content: true,
  curatorialContext: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkspaceSelect;

export async function listWorkspacesBySource(input: {
  db: PrismaClient;
  source: string;
  userId: string;
}): Promise<ExternalWorkspaceDto[]> {
  const workspaces = await input.db.workspace.findMany({
    where: {
      source: input.source,
      isDeleted: false,
      ...accessibleByUser(input.userId),
    },
    select: workspaceSelect,
    orderBy: { updatedAt: "desc" },
  });
  return workspaces.map(toDto);
}

export async function getWorkspaceBySourceKey(input: {
  db: PrismaClient;
  source: string;
  sourceKey: string;
  userId: string;
}): Promise<ExternalWorkspaceDto | null> {
  const workspace = await input.db.workspace.findFirst({
    where: {
      source: input.source,
      sourceKey: input.sourceKey,
      isDeleted: false,
      ...accessibleByUser(input.userId),
    },
    select: workspaceSelect,
  });
  return workspace ? toDto(workspace) : null;
}

export async function upsertWorkspaceBySource(input: {
  db: PrismaClient;
  userId: string;
  source: string;
  sourceKey: string;
  name?: string;
  description?: string | null;
  content?: unknown;
  curatorialContext?: unknown;
  status?: WorkspaceStatus;
  recordHistory?: boolean;
  changeDescription?: string;
}): Promise<ExternalWorkspaceDto> {
  const existing = await input.db.workspace.findUnique({
    where: {
      source_sourceKey: {
        source: input.source,
        sourceKey: input.sourceKey,
      },
    },
  });

  if (existing) {
    if (existing.isDeleted) {
      const canRevive =
        existing.userId === input.userId ||
        (await input.db.workspace.count({
          where: {
            id: existing.id,
            collaborators: { some: { id: input.userId } },
          },
        })) > 0;
      if (!canRevive) {
        throw new Error("Workspace not found or access denied");
      }

      const revived = await input.db.workspace.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          name: input.name?.trim()
            ? input.name.trim()
            : (existing.name ?? input.sourceKey),
          description:
            input.description === undefined
              ? existing.description
              : input.description,
          content:
            input.content === undefined
              ? existing.content === null
                ? undefined
                : (existing.content as Prisma.InputJsonValue)
              : (input.content as Prisma.InputJsonValue),
          curatorialContext:
            input.curatorialContext === undefined
              ? undefined
              : (input.curatorialContext as Prisma.InputJsonValue),
          status: input.status ?? "DRAFT",
        },
        select: workspaceSelect,
      });
      return toDto(revived);
    }

    const canWrite =
      existing.userId === input.userId ||
      (await input.db.workspace.count({
        where: {
          id: existing.id,
          collaborators: { some: { id: input.userId } },
        },
      })) > 0;
    if (!canWrite) {
      throw new Error("Workspace not found or access denied");
    }

    if (input.content !== undefined && input.recordHistory !== false) {
      await recordWritingHistoryIfNeeded({
        db: input.db,
        workspaceId: existing.id,
        previousContent: existing.content,
        currentContent: input.content,
        changedById: input.userId,
        changeDescription: input.changeDescription,
      });
    }

    const updated = await input.db.workspace.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        description:
          input.description === undefined
            ? existing.description
            : input.description,
        content:
          input.content === undefined
            ? undefined
            : (input.content as Prisma.InputJsonValue),
        curatorialContext:
          input.curatorialContext === undefined
            ? undefined
            : (input.curatorialContext as Prisma.InputJsonValue),
        status: input.status ?? existing.status,
      },
      select: workspaceSelect,
    });
    return toDto(updated);
  }

  const created = await input.db.workspace.create({
    data: {
      name: input.name?.trim() ? input.name.trim() : input.sourceKey,
      description: input.description ?? undefined,
      status: input.status ?? "DRAFT",
      source: input.source,
      sourceKey: input.sourceKey,
      content: (input.content as Prisma.InputJsonValue) ?? undefined,
      curatorialContext:
        (input.curatorialContext as Prisma.InputJsonValue) ?? undefined,
      user: { connect: { id: input.userId } },
    },
    select: workspaceSelect,
  });

  if (input.content !== undefined && input.recordHistory !== false) {
    await recordWritingHistoryIfNeeded({
      db: input.db,
      workspaceId: created.id,
      previousContent: null,
      currentContent: input.content,
      changedById: input.userId,
      changeDescription: input.changeDescription ?? "執筆を作成しました",
      force: true,
    });
  }

  return toDto(created);
}

export async function listWritingHistory(input: {
  db: PrismaClient;
  workspaceId: string;
  userId: string;
  take?: number;
}): Promise<ExternalWritingHistoryDto[]> {
  const workspace = await input.db.workspace.findFirst({
    where: {
      id: input.workspaceId,
      isDeleted: false,
      ...accessibleByUser(input.userId),
    },
    select: { id: true },
  });
  if (!workspace) {
    throw new Error("Workspace not found or access denied");
  }

  const histories = await input.db.writingHistory.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 50,
    include: {
      changedBy: { select: PUBLIC_USER_SELECT },
    },
  });

  return histories.map((history) => ({
    id: history.id,
    workspaceId: history.workspaceId,
    changeDescription: history.changeDescription,
    preview: tiptapPlainTextPreview(history.currentContent),
    previousPreview: tiptapPlainTextPreview(history.previousContent),
    createdAt: toIso(history.createdAt),
    changedBy: {
      id: history.changedBy.id,
      name: history.changedBy.name,
      image: history.changedBy.image,
    },
  }));
}

export async function restoreWritingHistory(input: {
  db: PrismaClient;
  workspaceId: string;
  historyId: string;
  userId: string;
}): Promise<ExternalWorkspaceDto> {
  const workspace = await input.db.workspace.findFirst({
    where: {
      id: input.workspaceId,
      isDeleted: false,
      ...accessibleByUser(input.userId),
    },
  });
  if (!workspace) {
    throw new Error("Workspace not found or access denied");
  }

  const history = await input.db.writingHistory.findFirst({
    where: {
      id: input.historyId,
      workspaceId: input.workspaceId,
    },
  });
  if (!history) {
    throw new Error("Writing history not found");
  }

  const restoredContent = history.currentContent;
  await recordWritingHistoryIfNeeded({
    db: input.db,
    workspaceId: workspace.id,
    previousContent: workspace.content,
    currentContent: restoredContent,
    changedById: input.userId,
    changeDescription: "履歴から復元しました",
    force: true,
  });

  const updated = await input.db.workspace.update({
    where: { id: workspace.id },
    data: {
      content: (restoredContent as Prisma.InputJsonValue) ?? undefined,
    },
    select: workspaceSelect,
  });
  return toDto(updated);
}

export async function resolveCollaboratorUserId(input: {
  db: PrismaClient;
  userId?: string;
  userEmail?: string;
}): Promise<string> {
  const userId = input.userId?.trim();
  if (userId) return userId;

  const userEmail = input.userEmail?.trim();
  if (!userEmail) {
    throw new Error("userId or userEmail is required");
  }

  const user = await input.db.user.findFirst({
    where: { email: userEmail },
    select: { id: true },
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user.id;
}

export async function addCollaboratorToWorkspace(input: {
  db: PrismaClient;
  workspaceId: string;
  ownerUserId: string;
  collaboratorUserId: string;
}): Promise<{
  workspaceId: string;
  collaborator: {
    id: string;
    name: string | null;
    image: string | null;
  };
}> {
  const workspace = await input.db.workspace.findFirst({
    where: {
      id: input.workspaceId,
      userId: input.ownerUserId,
      isDeleted: false,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found or access denied");
  }

  if (input.collaboratorUserId === input.ownerUserId) {
    throw new Error("Owner cannot be added as collaborator");
  }

  const collaborator = await input.db.user.findUnique({
    where: { id: input.collaboratorUserId },
    select: PUBLIC_USER_SELECT,
  });
  if (!collaborator) {
    throw new Error("User not found");
  }

  await input.db.workspace.update({
    where: { id: input.workspaceId },
    data: {
      collaborators: {
        connect: { id: input.collaboratorUserId },
      },
    },
  });

  return {
    workspaceId: input.workspaceId,
    collaborator,
  };
}

export type ExternalUserDto = {
  id: string;
  name: string | null;
  image: string | null;
};

export async function getExternalAuthenticatedUser(input: {
  db: PrismaClient;
  userId: string;
}): Promise<ExternalUserDto> {
  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    select: PUBLIC_USER_SELECT,
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}
