import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  type GraphNode,
  type GraphRelationship,
  type TopicSpace,
  WorkspaceStatus,
} from "@prisma/client";
import OpenAI from "openai";
import { env } from "@/env";
import { isDeepStrictEqual } from "util";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "ワークスペース名は必須です"),
  description: z.string().optional(),
  referencedTopicSpaceIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const GetWorkspaceSchema = z.object({
  id: z.string(),
});

const UpdateWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  content: z
    .object({
      type: z.string(),
      content: z.array(z.any()).optional(),
    })
    .optional(),
  status: z.nativeEnum(WorkspaceStatus).optional(),
  referencedTopicSpaceIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const AddCollaboratorSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

const RemoveCollaboratorSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

const TextCompletionSchema = z.object({
  workspaceId: z.string(),
  baseText: z.string(),
  searchEntities: z.array(z.string()).optional(),
  isDeepMode: z.boolean(),
});

const EntityInformationCompletionSchema = z.object({
  workspaceId: z.string(),
  entityName: z.string(),
});

export const workspaceRouter = createTRPCRouter({
  create: protectedProcedure
    .input(CreateWorkspaceSchema)
    .mutation(async ({ ctx, input }) => {
      const { name, description, referencedTopicSpaceIds, tags } = input;

      // ワークスペースを作成
      const workspace = await ctx.db.workspace.create({
        data: {
          name: name.trim(),
          description: description?.trim(),
          status: WorkspaceStatus.DRAFT,
          user: {
            connect: { id: ctx.session.user.id },
          },
          referencedTopicSpaces: referencedTopicSpaceIds
            ? {
                connect: referencedTopicSpaceIds.map((id) => ({ id })),
              }
            : undefined,
        },
        include: {
          referencedTopicSpaces: {
            include: {
              graphNodes: {
                where: { deletedAt: null },
              },
              graphRelationships: {
                where: { deletedAt: null },
              },
            },
          },
          tags: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          collaborators: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return workspace;
    }),

  createEmpty: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx, input }) => {
      const emptyWorkspace = await ctx.db.workspace.create({
        data: {
          name: "新しいワークスペース",
          description: "",
          status: WorkspaceStatus.DRAFT,
          user: {
            connect: { id: ctx.session.user.id },
          },
        },
        include: {
          referencedTopicSpaces: {
            include: {
              graphNodes: {
                where: { deletedAt: null },
              },
              graphRelationships: {
                where: { deletedAt: null },
              },
            },
          },
          tags: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          collaborators: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return emptyWorkspace;
    }),

  getById: protectedProcedure
    .input(GetWorkspaceSchema)
    .query(async ({ ctx, input }) => {
      const { id } = input;

      // ワークスペースのデータを取得
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id,
          isDeleted: false,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        include: {
          referencedTopicSpaces: {
            include: {
              graphNodes: {
                where: { deletedAt: null },
              },
              graphRelationships: {
                where: { deletedAt: null },
              },
            },
          },
          tags: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          collaborators: {
            select: { id: true, name: true, email: true },
          },
          writingHistory: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              changedBy: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      // グラフデータの形式に変換
      const graphDocument = {
        nodes: workspace.referencedTopicSpaces.flatMap(
          (topicSpace: TopicSpace & { graphNodes: GraphNode[] }) =>
            topicSpace.graphNodes.map((node: GraphNode) => ({
              id: node.id,
              name: node.name,
              label: node.label,
              properties: node.properties,
              topicSpaceId: node.topicSpaceId,
              documentGraphId: node.documentGraphId,
            })),
        ),
        relationships: workspace.referencedTopicSpaces.flatMap(
          (
            topicSpace: TopicSpace & {
              graphRelationships: GraphRelationship[];
            },
          ) =>
            topicSpace.graphRelationships.map((rel: GraphRelationship) => ({
              id: rel.id,
              type: rel.type,
              properties: rel.properties,
              sourceId: rel.fromNodeId,
              targetId: rel.toNodeId,
              topicSpaceId: rel.topicSpaceId,
              documentGraphId: rel.documentGraphId,
            })),
        ),
      };

      return {
        ...workspace,
        graphDocument,
      };
    }),

  getListBySession: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.workspace.findMany({
      where: {
        isDeleted: false,
        OR: [{ userId }, { collaborators: { some: { id: userId } } }],
      },
    });
  }),

  update: protectedProcedure
    .input(UpdateWorkspaceSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // ワークスペースの存在確認とアクセス権限チェック
      const existingWorkspace = await ctx.db.workspace.findFirst({
        where: {
          id,
          isDeleted: false,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
      });

      if (!existingWorkspace) {
        throw new Error("Workspace not found or access denied");
      }

      // 内容が変更された場合は履歴を記録
      // if (
      //   updateData.content &&
      //   updateData.content !== existingWorkspace.content
      // ) {
      //   await ctx.db.writingHistory.create({
      //     data: {
      //       workspaceId: id,
      //       previousContent: existingWorkspace.content ?? undefined,
      //       currentContent: updateData.content,
      //       changeDescription: "内容を更新しました",
      //       changedById: ctx.session.user.id,
      //     },
      //   });
      // }

      // ワークスペースを更新
      const { referencedTopicSpaceIds, tags, ...dataToUpdate } = updateData;
      const updatedWorkspace = await ctx.db.workspace.update({
        where: { id },
        data: {
          ...dataToUpdate,
          referencedTopicSpaces: referencedTopicSpaceIds
            ? {
                set: referencedTopicSpaceIds.map((topicSpaceId) => ({
                  id: topicSpaceId,
                })),
              }
            : undefined,
        },
        include: {
          referencedTopicSpaces: true,
          tags: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          collaborators: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return updatedWorkspace;
    }),

  addCollaborator: protectedProcedure
    .input(AddCollaboratorSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, userId } = input;

      // ワークスペースの所有者のみが共同編集者を追加できる
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          userId: ctx.session.user.id,
          isDeleted: false,
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      // 共同編集者を追加
      const updatedWorkspace = await ctx.db.workspace.update({
        where: { id: workspaceId },
        data: {
          collaborators: {
            connect: { id: userId },
          },
        },
        include: {
          collaborators: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return updatedWorkspace;
    }),

  removeCollaborator: protectedProcedure
    .input(RemoveCollaboratorSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, userId } = input;

      // ワークスペースの所有者のみが共同編集者を削除できる
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          userId: ctx.session.user.id,
          isDeleted: false,
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      // 共同編集者を削除
      const updatedWorkspace = await ctx.db.workspace.update({
        where: { id: workspaceId },
        data: {
          collaborators: {
            disconnect: { id: userId },
          },
        },
        include: {
          collaborators: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return updatedWorkspace;
    }),

  getMyWorkspaces: protectedProcedure.query(async ({ ctx }) => {
    // ユーザーが所有または共同編集しているワークスペースを取得
    const workspaces = await ctx.db.workspace.findMany({
      where: {
        isDeleted: false,
        OR: [
          { userId: ctx.session.user.id },
          { collaborators: { some: { id: ctx.session.user.id } } },
        ],
      },
      include: {
        tags: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        collaborators: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            writingHistory: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return workspaces;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      // ワークスペースの所有者のみが削除できる
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id,
          userId: ctx.session.user.id,
          isDeleted: false,
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      // 論理削除
      const deletedWorkspace = await ctx.db.workspace.update({
        where: { id },
        data: { isDeleted: true },
      });

      return deletedWorkspace;
    }),

  textCompletion: protectedProcedure
    .input(TextCompletionSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, baseText, searchEntities, isDeepMode } = input;

      console.log("workspaceId: ", workspaceId);
      console.log("baseText: ", baseText);
      console.log("searchEntities: ", searchEntities);

      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          isDeleted: false,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        include: {
          referencedTopicSpaces: true,
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      const topicSpaceTools = isDeepMode
        ? workspace.referencedTopicSpaces.map((topicSpace) => ({
            type: "mcp" as const,
            server_label: `context-search-${topicSpace.id}`,
            server_url: `${env.NEXT_PUBLIC_BASE_URL}/api/topic-spaces/${topicSpace.id}/mcp`,
            require_approval: "never" as const,
          }))
        : [];

      // const topicSpaceTools = [
      //   {
      //     type: "mcp" as const,
      //     server_label: `context-search-${workspace.referencedTopicSpaces[0]?.name}`,
      //     server_url: `https://arstraverse.caric.jp/api/topic-spaces/cm8los72z00065adrgtn7b4tk/mcp`,
      //     require_approval: "never" as const,
      //   },
      // ];

      console.log("topicSpaceTools: ", topicSpaceTools);

      const openai = new OpenAI();

      // MCPツールが利用できない場合のフォールバック
      let response;
      try {
        response = await openai.responses.create({
          model: "gpt-4o-mini",
          tools: topicSpaceTools,
          input: isDeepMode
            ? `あなたは、文脈を踏まえながら論理的でわかりやすい文章を執筆する専門家です。${topicSpaceTools.length > 0 ? `ツール「context-search ${workspace.referencedTopicSpaces[0]?.id}」を利用してこれから示すエンティティについてそれぞれ個別に検索を行い、文脈情報を利用しながら、` : ""}これから示す元となるテキストの続きを補完してください。応答として出力するのは、元となるテキストの続きの文章だけにしてください。
          ${searchEntities && searchEntities.length > 0 ? `\n検索するエンティティ：${searchEntities.join(", ")}` : ""}
          \n元となるテキスト：${baseText}`
            : `あなたは、文脈を踏まえながら論理的でわかりやすい文章を執筆する専門家です。文脈情報を利用しながら、これから示す元となるテキストの続きを一文だけ補完してください。応答として出力するのは、元となるテキストの続きの文章だけにしてください。
          \n元となるテキスト：${baseText}`,
        });
      } catch (error) {
        console.error(
          "MCP tool error, falling back to basic completion:",
          error,
        );
        // MCPツールが失敗した場合は基本的なテキスト補完にフォールバック
        response = await openai.responses.create({
          model: "gpt-4o-mini",
          input: `以下のテキストの続きを一文だけ補完してください。応答として出力するのは、元となるテキストの続きの文章だけにしてください。\n${baseText}`,
        });
      }

      console.log("response: ", response.output_text);

      const suggestion = response.output_text ?? "";
      const withoutBaseText = suggestion.startsWith(baseText)
        ? suggestion.slice(baseText.length)
        : suggestion;
      return withoutBaseText;
    }),

  entityInformationCompletion: protectedProcedure
    .input(EntityInformationCompletionSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, entityName } = input;

      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          isDeleted: false,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        include: {
          referencedTopicSpaces: {
            include: {
              graphNodes: {
                where: { deletedAt: null },
              },
              graphRelationships: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      const graphNodes = workspace.referencedTopicSpaces.flatMap(
        (topicSpace: TopicSpace & { graphNodes: GraphNode[] }) =>
          topicSpace.graphNodes,
      );

      const entityInformation = graphNodes.find(
        (node: GraphNode) => node.name === entityName,
      );

      const graphRelationships = workspace.referencedTopicSpaces.flatMap(
        (
          topicSpace: TopicSpace & { graphRelationships: GraphRelationship[] },
        ) => topicSpace.graphRelationships,
      );

      const neighbors = graphRelationships.filter(
        (relationship: GraphRelationship) =>
          relationship.fromNodeId === entityInformation?.id ||
          relationship.toNodeId === entityInformation?.id,
      );

      const neighborGraphNodes = graphNodes.filter(
        (node: GraphNode) =>
          neighbors.some(
            (relationship: GraphRelationship) =>
              relationship.fromNodeId === node.id,
          ) ||
          neighbors.some(
            (relationship: GraphRelationship) =>
              relationship.toNodeId === node.id,
          ),
      );

      const openai = new OpenAI();
      let context = "";
      const nodes = neighborGraphNodes;
      neighbors.forEach((edge) => {
        context += `(${
          nodes.find((n) => {
            return n?.id === edge?.fromNodeId;
          })?.name
        })-[${edge?.type}]->(${
          nodes.find((n) => {
            return n?.id === edge?.toNodeId;
          })?.name
        })\n`;
      });

      const assistant = await openai.beta.assistants.create({
        name: "エンティティ情報アシスタント",
        instructions:
          "必ず与えられた文脈からわかる情報を使用して回答を生成してください。",
        model: "gpt-4o-mini",
        temperature: 1.0,
      });
      console.log("context: \n", context);
      const thread = await openai.beta.threads.create({
        messages: [
          {
            role: "user",
            content: `「${entityName}」についての情報を作成しようとしています。下記の文脈を使用して一文の短い説明を作成してください。\n${context}`,
          },
        ],
      });

      try {
        const run = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: assistant.id,
        });

        // 実行が完了するまで待機
        let runStatus = await openai.beta.threads.runs.retrieve(run.id, {
          thread_id: thread.id,
        });
        while (
          runStatus.status !== "completed" &&
          runStatus.status !== "failed"
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(run.id, {
            thread_id: thread.id,
          });
        }

        if (runStatus.status === "failed") {
          throw new Error("アシスタントの実行に失敗しました");
        }

        // メッセージを取得
        const messages = await openai.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0];

        if (lastMessage && lastMessage.content[0]?.type === "text") {
          const suggestionText = lastMessage.content[0].text.value;
          const textWithoutFirstEntityName = suggestionText.startsWith(
            entityName,
          )
            ? suggestionText.slice(entityName.length)
            : suggestionText;
          return {
            entityInformationText: textWithoutFirstEntityName,
          };
        } else {
          throw new Error("メッセージの取得に失敗しました");
        }
      } catch (error) {
        console.log("error: ", error);
        return {
          entityInformationText: "",
          error: "作成できませんでした",
        };
      }
    }),
});
