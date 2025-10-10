import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { AnnotationType, AnnotationChangeType } from "@prisma/client";
import { TiptapContentSchema } from "./workspace";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";

export const annotationRouter = createTRPCRouter({
  // 注釈IDで注釈を取得
  getAnnotationById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const annotation = await ctx.db.annotation.findUnique({
        where: { id: input.id, isDeleted: false },
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
              histories: {
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
            orderBy: { createdAt: "asc" },
          },
          histories: true,
          targetNode: {
            select: {
              id: true,
              name: true,
              label: true,
              topicSpaceId: true,
            },
          },
          targetRelationship: {
            select: {
              id: true,
              topicSpaceId: true,
              type: true,
            },
          },
        },
      });

      if (!annotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "注釈が見つかりません",
        });
      }

      return annotation;
    }),

  // 注釈の親注釈を取得
  getAnnotationParent: protectedProcedure
    .input(z.object({ annotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const annotation = await ctx.db.annotation.findUnique({
        where: { id: input.annotationId, isDeleted: false },
        include: {
          parentAnnotation: {
            where: { isDeleted: false },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
              targetNode: {
                select: {
                  id: true,
                  name: true,
                  label: true,
                  topicSpaceId: true,
                },
              },
              targetRelationship: {
                select: {
                  id: true,
                  type: true,
                  topicSpaceId: true,
                },
              },
              histories: {
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
          },
        },
      });

      return annotation?.parentAnnotation ?? null;
    }),

  // 注釈の返信を取得
  getAnnotationReplies: protectedProcedure
    .input(z.object({ parentAnnotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const replies = await ctx.db.annotation.findMany({
        where: {
          parentAnnotationId: input.parentAnnotationId,
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
        orderBy: { createdAt: "asc" },
      });

      return replies;
    }),

  // 注釈のグラフコンテキストを取得
  getAnnotationGraphContext: protectedProcedure
    .input(z.object({ annotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const annotation = await ctx.db.annotation.findUnique({
        where: { id: input.annotationId, isDeleted: false },
        include: {
          targetNode: true,
        },
      });

      if (!annotation || !annotation.targetNodeId || !annotation.targetNode) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "注釈または対象ノードが見つかりません",
        });
      }

      // 対象ノードとその周辺のノード・関係を取得
      const targetNode = annotation.targetNode;

      // 対象ノードに接続されているノードを取得
      const connectedNodes = await ctx.db.graphNode.findMany({
        where: {
          OR: [
            {
              relationshipsFrom: {
                some: {
                  toNodeId: targetNode.id,
                },
              },
            },
            {
              relationshipsTo: {
                some: {
                  fromNodeId: targetNode.id,
                },
              },
            },
          ],
          topicSpaceId: targetNode.topicSpaceId,
        },
      });

      // 対象ノードも含める
      const allNodes = [targetNode, ...connectedNodes];
      const nodeIds = allNodes.map((node) => node.id);

      // これらのノード間の関係を取得
      const relationships = await ctx.db.graphRelationship.findMany({
        where: {
          OR: [
            {
              fromNodeId: { in: nodeIds },
              toNodeId: { in: nodeIds },
            },
          ],
          topicSpaceId: targetNode.topicSpaceId,
        },
      });

      return formGraphDataForFrontend({
        nodes: allNodes,
        relationships: relationships,
      });
    }),
  // ノードの注釈一覧取得（議論の盛り上がり順）
  getNodeAnnotations: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        topicSpaceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const annotations = await ctx.db.annotation.findMany({
        where: {
          targetNodeId: input.nodeId,
          isDeleted: false,
          targetNode: {
            topicSpaceId: input.topicSpaceId,
          },
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
            take: 5, // 最新5件の履歴
          },
          rootDiscussions: {
            include: {
              participants: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: [
          // 議論の盛り上がり順（子注釈数 + 議論の参加者数）
          { childAnnotations: { _count: "desc" } },
          { rootDiscussions: { _count: "desc" } },
          { createdAt: "desc" },
        ],
      });

      return annotations;
    }),

  // エッジの注釈一覧取得（議論の盛り上がり順）
  getEdgeAnnotations: protectedProcedure
    .input(
      z.object({
        edgeId: z.string(),
        topicSpaceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const annotations = await ctx.db.annotation.findMany({
        where: {
          targetRelationshipId: input.edgeId,
          isDeleted: false,
          targetRelationship: {
            topicSpaceId: input.topicSpaceId,
          },
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
          rootDiscussions: {
            include: {
              participants: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: [
          { childAnnotations: { _count: "desc" } },
          { rootDiscussions: { _count: "desc" } },
          { createdAt: "desc" },
        ],
      });

      return annotations;
    }),

  // 注釈の詳細取得
  getAnnotationDetail: protectedProcedure
    .input(
      z.object({
        annotationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const annotation = await ctx.db.annotation.findUnique({
        where: {
          id: input.annotationId,
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
          targetNode: {
            select: {
              id: true,
              name: true,
              label: true,
            },
          },
          targetRelationship: {
            select: {
              id: true,
              type: true,
            },
          },
          parentAnnotation: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
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
            include: {
              changedBy: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
          rootDiscussions: {
            include: {
              participants: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      if (!annotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "注釈が見つかりません",
        });
      }

      return annotation;
    }),

  // 新しい注釈を作成
  createAnnotation: protectedProcedure
    .input(
      z.object({
        content: TiptapContentSchema.optional(),
        type: z.nativeEnum(AnnotationType),
        targetNodeId: z.string().optional(),
        targetRelationshipId: z.string().optional(),
        parentAnnotationId: z.string().optional(),
        topicSpaceId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 対象のノードまたはエッジが存在するかチェック
      if (input.targetNodeId) {
        const node = await ctx.db.graphNode.findFirst({
          where: {
            id: input.targetNodeId,
            topicSpaceId: input.topicSpaceId,
          },
        });
        if (!node) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "対象のノードが見つかりません",
          });
        }
      }

      if (input.targetRelationshipId) {
        const edge = await ctx.db.graphRelationship.findFirst({
          where: {
            id: input.targetRelationshipId,
            topicSpaceId: input.topicSpaceId,
          },
        });
        if (!edge) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "対象のエッジが見つかりません",
          });
        }
      }

      // 親注釈が存在するかチェックし、targetNodeId/targetRelationshipIdを継承
      let inheritedTargetNodeId = input.targetNodeId;
      let inheritedTargetRelationshipId = input.targetRelationshipId;

      if (input.parentAnnotationId) {
        const parentAnnotation = await ctx.db.annotation.findFirst({
          where: {
            id: input.parentAnnotationId,
            isDeleted: false,
          },
          select: {
            targetNodeId: true,
            targetRelationshipId: true,
          },
        });
        if (!parentAnnotation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "親注釈が見つかりません",
          });
        }

        // 親注釈のtargetNodeId/targetRelationshipIdを継承
        inheritedTargetNodeId = parentAnnotation.targetNodeId ?? undefined;
        inheritedTargetRelationshipId =
          parentAnnotation.targetRelationshipId ?? undefined;
      }

      const annotation = await ctx.db.annotation.create({
        data: {
          content: input.content,
          type: input.type,
          targetNodeId: inheritedTargetNodeId,
          targetRelationshipId: inheritedTargetRelationshipId,
          parentAnnotationId: input.parentAnnotationId,
          authorId: ctx.session.user.id,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      // 履歴を作成
      await ctx.db.annotationHistory.create({
        data: {
          annotationId: annotation.id,
          changeType: AnnotationChangeType.CREATED,
          currentContent: input.content,
          currentType: input.type,
          changeReason: "新規作成",
          changedById: ctx.session.user.id,
        },
      });

      return annotation;
    }),

  // 注釈を更新
  updateAnnotation: protectedProcedure
    .input(
      z.object({
        annotationId: z.string(),
        content: TiptapContentSchema.optional(),
        type: z.nativeEnum(AnnotationType).optional(),
        changeReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingAnnotation = await ctx.db.annotation.findUnique({
        where: {
          id: input.annotationId,
          isDeleted: false,
        },
      });

      if (!existingAnnotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "注釈が見つかりません",
        });
      }

      // 作成者または管理者のみ更新可能
      if (existingAnnotation.authorId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この注釈を更新する権限がありません",
        });
      }

      const updatedAnnotation = await ctx.db.annotation.update({
        where: {
          id: input.annotationId,
        },
        data: {
          content: input.content,
          type: input.type ?? existingAnnotation.type,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      // 履歴を作成
      await ctx.db.annotationHistory.create({
        data: {
          annotationId: input.annotationId,
          changeType: AnnotationChangeType.UPDATED,
          previousContent: existingAnnotation.content ?? undefined,
          currentContent: input.content,
          previousType: existingAnnotation.type,
          currentType: input.type ?? existingAnnotation.type,
          changeReason: input.changeReason,
          changedById: ctx.session.user.id,
        },
      });

      return updatedAnnotation;
    }),

  // 注釈を削除（論理削除）
  deleteAnnotation: protectedProcedure
    .input(
      z.object({
        annotationId: z.string(),
        changeReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingAnnotation = await ctx.db.annotation.findUnique({
        where: {
          id: input.annotationId,
          isDeleted: false,
        },
      });

      if (!existingAnnotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "注釈が見つかりません",
        });
      }

      // 作成者または管理者のみ削除可能
      if (existingAnnotation.authorId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この注釈を削除する権限がありません",
        });
      }

      const deletedAnnotation = await ctx.db.annotation.update({
        where: {
          id: input.annotationId,
        },
        data: {
          isDeleted: true,
        },
      });

      // 履歴を作成
      await ctx.db.annotationHistory.create({
        data: {
          annotationId: input.annotationId,
          changeType: AnnotationChangeType.DELETED,
          previousContent: existingAnnotation.content ?? undefined,
          changeReason: input.changeReason,
          changedById: ctx.session.user.id,
        },
      });

      return deletedAnnotation;
    }),

  // 注釈の履歴一覧取得
  getAnnotationHistory: protectedProcedure
    .input(
      z.object({
        annotationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const histories = await ctx.db.annotationHistory.findMany({
        where: {
          annotationId: input.annotationId,
        },
        include: {
          changedBy: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return histories;
    }),

  // 注釈から知識グラフ抽出のプレビュー
  previewAnnotationGraph: protectedProcedure
    .input(
      z.object({
        annotationId: z.string(),
        extractMode: z.string().optional().default("langChain"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const annotation = await ctx.db.annotation.findUnique({
        where: {
          id: input.annotationId,
          isDeleted: false,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!annotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "注釈が見つかりません",
        });
      }

      try {
        const { AnnotationGraphExtractor } = await import(
          "@/server/lib/annotation-graph-extractor"
        );
        const extractor = new AnnotationGraphExtractor(ctx.db);

        const result = await extractor.extractGraphFromAnnotation(
          input.annotationId,
          input.extractMode,
        );

        return {
          annotation,
          extractedGraph: result.graphDocument,
          text: result.text,
          fileUrl: result.url,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `グラフ抽出エラー: ${String(error)}`,
        });
      }
    }),

  // 注釈をSourceDocumentとして統合
  // source-document.tsのcreateWithGraphDataをフロントエンドから叩いてグラフとドキュメントのレコードを作った後に
  // topic-space.tsのattachDocumentsを叩いてグラフを統合すればこの処理は不要

  // integrateAnnotationAsDocument: protectedProcedure
  //   .input(
  //     z.object({
  //       annotationId: z.string(),
  //       topicSpaceId: z.string(),
  //       extractedGraph: z.object({
  //         nodes: z.array(z.any()),
  //         edges: z.array(z.any()),
  //       }),
  //       url: z.string(),
  //     }),
  //   )
  //   .mutation(async ({ ctx, input }) => {
  //     const annotation = await ctx.db.annotation.findUnique({
  //       where: {
  //         id: input.annotationId,
  //         isDeleted: false,
  //       },
  //     });

  //     if (!annotation) {
  //       throw new TRPCError({
  //         code: "NOT_FOUND",
  //         message: "注釈が見つかりません",
  //       });
  //     }

  //     // SourceDocumentを作成
  //     const sourceDocument = await ctx.db.sourceDocument.create({
  //       data: {
  //         name: `注釈から抽出: ${annotation.id}`,
  //         url: input.url,
  //         userId: ctx.session.user.id,
  //         documentType: "INPUT_TXT",
  //       },
  //     });

  //     // 注釈とSourceDocumentを関連付け
  //     await ctx.db.annotation.update({
  //       where: {
  //         id: annotation.id,
  //       },
  //       data: {
  //         sourceDocumentId: sourceDocument.id,
  //       },
  //     });

  //     // TODO: 実際の知識グラフ統合ロジックを実装
  //     // DocumentGraphの作成とGraphNode、GraphRelationshipの作成

  //     return {
  //       sourceDocument,
  //       message: "注釈がSourceDocumentとして統合されました",
  //     };
  //   }),

  // 注釈のクラスタリング実行
  performAnnotationClustering: protectedProcedure
    .input(
      z.object({
        rootAnnotationId: z.string(),
        params: z
          .object({
            featureExtraction: z.object({
              maxFeatures: z.number().min(10).max(5000).default(1000),
              minDf: z.number().min(1).max(10).default(2),
              maxDf: z.number().min(0.1).max(1.0).default(0.95),
              includeMetadata: z.boolean().default(true),
              includeStructural: z.boolean().default(true),
            }),
            dimensionalityReduction: z.object({
              nNeighbors: z.number().min(2).max(100).default(15),
              minDist: z.number().min(0.0).max(1.0).default(0.1),
              spread: z.number().min(0.5).max(3.0).default(1.0),
              nComponents: z.number().min(2).max(10).default(2),
              randomSeed: z.number().default(42),
            }),
            clustering: z.object({
              algorithm: z
                .enum(["KMEANS", "DBSCAN", "HIERARCHICAL"])
                .default("KMEANS"),
              nClusters: z.number().min(2).max(20).optional(),
              eps: z.number().min(0.1).max(2.0).optional(),
              minSamples: z.number().min(2).max(20).optional(),
              linkage: z
                .enum(["ward", "complete", "average", "single"])
                .optional(),
            }),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { AnnotationClusteringOrchestrator } = await import(
          "@/server/lib/annotation-clustering-orchestrator"
        );

        const orchestrator = new AnnotationClusteringOrchestrator(ctx.db);

        // デフォルトパラメータを使用
        const params = input.params || orchestrator.getDefaultParams();

        // パラメータの妥当性を検証
        const validation = orchestrator.validateParams(params);
        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `パラメータが無効です: ${validation.errors.join(", ")}`,
          });
        }

        // クラスタリングを実行
        const result = await orchestrator.performClustering(
          input.rootAnnotationId,
          params,
        );

        // 統計情報を追加
        const statistics = orchestrator.getClusteringStatistics(result);

        return {
          ...result,
          statistics,
        };
      } catch (error) {
        console.error("クラスタリング実行エラー:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `クラスタリングに失敗しました: ${String(error)}`,
        });
      }
    }),

  // クラスタリング結果の取得（キャッシュ用）
  getClusteringResult: protectedProcedure
    .input(
      z.object({
        rootAnnotationId: z.string(),
        cacheKey: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 将来的にはキャッシュ機能を実装
      // 現在は常に新しいクラスタリングを実行
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "キャッシュ機能は未実装です",
      });
    }),
});
