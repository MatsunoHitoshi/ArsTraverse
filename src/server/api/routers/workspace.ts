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

export const TiptapContentSchema = z.object({
  type: z.string(),
  content: z.array(z.any()).optional(),
});

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
  content: TiptapContentSchema.optional(),
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

// 部分グラフを直接受け取って補完を行うAPI用のスキーマ
const GraphNodeFrontendSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  properties: z.record(z.any()),
  topicSpaceId: z.string().optional(),
});

const GraphRelationshipFrontendSchema = z.object({
  id: z.string().optional().default(""),
  type: z.string().default("related"),
  properties: z.record(z.any()).optional().default({}),
  sourceId: z.string(),
  targetId: z.string(),
  topicSpaceId: z.string().optional(),
});

const GraphDocumentFrontendSchema = z.object({
  nodes: z.array(GraphNodeFrontendSchema),
  relationships: z.array(GraphRelationshipFrontendSchema),
});

const TextCompletionWithGraphSchema = z.object({
  workspaceId: z.string(),
  baseText: z.string(),
  subgraph: GraphDocumentFrontendSchema,
});

// const EntityInformationCompletionSchema = z.object({
//   workspaceId: z.string(),
//   entityName: z.string(),
// });

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
      console.log("isDeepMode: ", isDeepMode);

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
              graphNodes: true,
              graphRelationships: true,
            },
          },
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      console.log("isDeepMode: ", isDeepMode);

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

      const baseContexts = workspace.referencedTopicSpaces[0]?.graphNodes
        .filter((node) => searchEntities?.includes(node.name))
        .map((baseNode) => {
          const neighborRelationships =
            workspace.referencedTopicSpaces[0]?.graphRelationships.filter(
              (relationship) =>
                relationship.fromNodeId === baseNode.id ||
                relationship.toNodeId === baseNode.id,
            );
          const neighborNodes =
            workspace.referencedTopicSpaces[0]?.graphNodes.filter((node) =>
              neighborRelationships?.some(
                (relationship) =>
                  relationship.fromNodeId === node.id ||
                  relationship.toNodeId === node.id,
              ),
            );
          return (
            `### (ID: ${baseNode.id}, name: ${baseNode.name}, label: ${baseNode.label}) \n#### ノードの関連情報\n` +
            neighborNodes
              ?.map((node) => {
                return ` - [${
                  neighborRelationships?.find(
                    (relationship) =>
                      relationship.fromNodeId === node.id ||
                      relationship.toNodeId === node.id,
                  )?.type
                }] -> (ID: ${node.id}, name: ${node.name}, label: ${node.label})\n`;
              })
              .join("\n\n")
          );
        })
        .join("\n");

      console.log("baseContexts: ", baseContexts);

      let response;
      try {
        response = await openai.responses.create({
          model: "gpt-4.1-nano",
          tools: topicSpaceTools,
          input: isDeepMode
            ? `あなたは、文脈を踏まえながら論理的でわかりやすい文章を執筆する専門家です。${topicSpaceTools.length > 0 ? `ツール「context-search ${workspace.referencedTopicSpaces[0]?.id}」を利用してこれから示すエンティティについて検索を行い、関係性や具体的な言及箇所の検索も併用しながら、` : ""}これから示すテキストの続きである、[ここを補完する]に当てはまる部分を補完してください。必ず言及されている箇所の文章も参照しながら文章を生成してください。応答として出力するのは[ここを補完する]に入る文章だけにしてください。必ず、元の文章と[ここを補完する]の部分が自然につながるように文章を生成してください。
          ${searchEntities && searchEntities.length > 0 ? `\n検索するエンティティ：${searchEntities.join(", ")}` : ""}
          \n===テキスト===\n${baseText} [ここを補完する]`
            : `あなたは、文脈を踏まえながら論理的でわかりやすい文章を執筆する専門家です。これから示すテキストの続きである、[ここを補完する]に当てはまる部分を1文だけ補完してください。応答として出力するのは[ここを補完する]の部分の文章だけにしてください。必要に応じて関連情報も参照しながら文章を生成してください。必ず、元の文章と[ここを補完する]の部分が自然につながるように文章を生成してください。
          \n===テキスト===\n${baseText} [ここを補完する]
          \n===関連情報===\n${baseContexts}`,
        });
      } catch (error) {
        console.error(
          "MCP tool error, falling back to basic completion:",
          error,
        );
        // MCPツールが失敗した場合は基本的なテキスト補完にフォールバック
        response = await openai.responses.create({
          model: "gpt-4.1-nano",
          input: `以下のテキストの続きである、[ここを補完する]に当てはまる部分を1文だけ補完してください。応答として出力するのは、[ここを補完する]の部分の文章だけにしてください。必ず、元の文章と[ここを補完する]の部分が自然につながるように文章を生成してください。\n${baseText} [ここを補完する]`,
        });
      }

      console.log("response: ", response.output_text);

      const suggestion = response.output_text ?? "";
      const withoutBaseText = suggestion.startsWith(baseText)
        ? suggestion.slice(baseText.length)
        : suggestion;
      return withoutBaseText;
    }),

  // 部分グラフを直接受け取り、コンテキストとして利用して補完を行う
  textCompletionWithGraph: protectedProcedure
    .input(TextCompletionWithGraphSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, baseText, subgraph } = input;

      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          isDeleted: false,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
        select: { id: true },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      const openai = new OpenAI();

      // subgraph から簡潔なコンテキストテキストを生成
      const nodeMap = new Map(subgraph.nodes.map((n) => [n.id, n]));
      const contextLines: string[] = [];
      for (const rel of subgraph.relationships) {
        const source = nodeMap.get(rel.sourceId);
        const target = nodeMap.get(rel.targetId);
        if (source && target) {
          contextLines.push(
            `(${source.label}:${source.name}) -[${rel.type}]-> (${target.label}:${target.name})`,
          );
        }
      }
      if (contextLines.length === 0) {
        // ノードのみの場合も簡単に列挙
        for (const n of subgraph.nodes) {
          contextLines.push(`(${n.label}:${n.name})`);
        }
      }
      const graphContextText = contextLines.join("\n");

      let response;
      try {
        response = await openai.responses.create({
          model: "gpt-4.1-nano",
          input: `あなたは知識グラフ記述の専門家です。以下の[グラフ文脈]に含まれる関係のみを根拠に、グラフの論理構造を忠実に文章化してください。事実は[グラフ文脈]の範囲を超えないでください。出力は1〜3文程度。\n
===スタイル参照(文体のみ)===\n${baseText}\n
===グラフ文脈===\n${graphContextText}`,
        });
      } catch (error) {
        // フォールバック
        response = await openai.responses.create({
          model: "gpt-4.1-nano",
          input: `以下の[グラフ文脈]の関係だけを根拠に、その論理構造を説明する短い文章(1〜3文)を書いてください。文体は[スタイル参照]に寄せてください。\n
===スタイル参照(文体のみ)===\n${baseText}\n
===グラフ文脈===\n${graphContextText}`,
        });
      }

      const suggestion = response.output_text ?? "";
      const withoutBaseText = suggestion.startsWith(baseText)
        ? suggestion.slice(baseText.length)
        : suggestion;
      return withoutBaseText;
    }),

  // ワークスペース関連エッジの注釈一覧取得
  getWorkspaceEdgeAnnotations: protectedProcedure
    .input(
      z.object({
        edgeId: z.string(),
        workspaceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // ワークスペースの参照トピックスペースを取得
      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        include: {
          referencedTopicSpaces: true,
        },
      });

      if (!workspace) {
        throw new Error("ワークスペースが見つかりません");
      }

      // エッジが参照トピックスペースに属するかチェック
      const edge = await ctx.db.graphRelationship.findFirst({
        where: {
          id: input.edgeId,
          topicSpaceId: {
            in: workspace.referencedTopicSpaces.map((ts) => ts.id),
          },
        },
      });

      if (!edge) {
        throw new Error(
          "指定されたエッジはこのワークスペースで参照されていません",
        );
      }

      // 注釈を取得
      const annotations = await ctx.db.annotation.findMany({
        where: {
          targetRelationshipId: input.edgeId,
          isDeleted: false,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          childAnnotations: {
            where: { isDeleted: false },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          histories: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: [
          { childAnnotations: { _count: "desc" } },
          { createdAt: "desc" },
        ],
      });

      return annotations;
    }),
});
