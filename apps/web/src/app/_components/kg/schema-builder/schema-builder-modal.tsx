"use client";

import { useState } from "react";
import { Modal } from "../../modal/modal";
import { Button } from "../../button/button";
import { Textarea } from "../../textarea";
import { ListboxInput } from "../../input/listbox-input";
import { TextInput } from "../../input/text-input";
import { api } from "@/trpc/react";
import type { TextChunk, MappingRule } from "@/server/lib/extractors/base";

type SchemaBuilderModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSave: (mappingRules: {
    sampleText: string;
    chunks: TextChunk[];
    mappings: MappingRule[];
  }) => void;
};

export const SchemaBuilderModal = ({
  isOpen,
  setIsOpen,
  onSave,
}: SchemaBuilderModalProps) => {
  const [sampleText, setSampleText] = useState<string>("");
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [mappings, setMappings] = useState<MappingRule[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [convertingEdgeTypes, setConvertingEdgeTypes] = useState<Set<number>>(
    new Set(),
  );

  const analyzeTextStructure = api.kg.analyzeTextStructure.useMutation();
  const convertToEdgeType = api.kg.convertToEdgeType.useMutation();

  const handleAnalyze = async () => {
    if (!sampleText.trim()) {
      alert("サンプルテキストを入力してください");
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeTextStructure.mutateAsync({
        sampleText,
      });

      if (result.data?.chunks) {
        setChunks(result.data.chunks);
        // 初期マッピングを設定（推奨された役割を使用）
        const initialMappings: MappingRule[] = result.data.chunks.map(
          (chunk, index) => {
            const mapping: MappingRule = {
              chunkIndex: index,
              role: chunk.suggestedRole,
            };
            if (chunk.suggestedRole === "node") {
              mapping.nodeLabel = chunk.type;
            } else if (chunk.suggestedRole === "node_property") {
              mapping.propertyName = chunk.type;
            } else if (chunk.suggestedRole === "edge_property") {
              mapping.edgePropertyName = chunk.type;
            } else if (chunk.suggestedRole === "edge") {
              // エッジの場合は一時的に元のテキストを設定し、変換処理を開始
              mapping.relationshipType = chunk.text;
            }
            return mapping;
          },
        );
        setMappings(initialMappings);

        // エッジタイプを変換
        const edgeChunks = result.data.chunks
          .map((chunk, index) => ({ chunk, index }))
          .filter(({ chunk }) => chunk.suggestedRole === "edge");

        for (const { chunk, index } of edgeChunks) {
          setConvertingEdgeTypes((prev) => new Set(prev).add(index));
          convertToEdgeType
            .mutateAsync({ text: chunk.text })
            .then((result) => {
              if (result.data?.edgeType) {
                setMappings((prevMappings) => {
                  const updated = [...prevMappings];
                  const mappingIndex = updated.findIndex(
                    (m) => m.chunkIndex === index,
                  );
                  const mapping =
                    mappingIndex >= 0 ? updated[mappingIndex] : null;
                  if (mapping) {
                    mapping.relationshipType = result.data.edgeType;
                  }
                  return updated;
                });
              }
            })
            .catch((error) => {
              console.error("Edge type conversion error:", error);
            })
            .finally(() => {
              setConvertingEdgeTypes((prev) => {
                const newSet = new Set(prev);
                newSet.delete(index);
                return newSet;
              });
            });
        }
      }
    } catch (error) {
      console.error("Text analysis error:", error);
      alert("テキスト解析に失敗しました");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleMappingChange = (
    chunkIndex: number,
    field: keyof MappingRule,
    value: string | undefined,
  ) => {
    setMappings((prev) => {
      const updated = [...prev];
      const mappingIndex = updated.findIndex(
        (m) => m.chunkIndex === chunkIndex,
      );
      if (mappingIndex >= 0) {
        const existing = updated[mappingIndex];
        if (!existing) return prev;
        if (field === "role") {
          existing.role = value as
            | "node"
            | "node_property"
            | "edge_property"
            | "edge"
            | "ignore";
          // エッジを選択した時は、切り出したテキストを英語のアッパースネークケースに変換
          if (existing.role === "edge") {
            const chunk = chunks[chunkIndex];
            if (chunk) {
              setConvertingEdgeTypes((prev) => new Set(prev).add(chunkIndex));
              convertToEdgeType
                .mutateAsync({ text: chunk.text })
                .then((result) => {
                  if (result.data?.edgeType) {
                    setMappings((prevMappings) => {
                      const updated = [...prevMappings];
                      const mappingIndex = updated.findIndex(
                        (m) => m.chunkIndex === chunkIndex,
                      );
                      const mapping =
                        mappingIndex >= 0 ? updated[mappingIndex] : null;
                      if (mapping) {
                        mapping.relationshipType = result.data.edgeType;
                      }
                      return updated;
                    });
                  }
                })
                .catch((error) => {
                  console.error("Edge type conversion error:", error);
                  // エラー時は元のテキストを使用
                  setMappings((prevMappings) => {
                    const updated = [...prevMappings];
                    const mappingIndex = updated.findIndex(
                      (m) => m.chunkIndex === chunkIndex,
                    );
                    const mapping =
                      mappingIndex >= 0 ? updated[mappingIndex] : null;
                    if (mapping) {
                      mapping.relationshipType = chunk.text;
                    }
                    return updated;
                  });
                })
                .finally(() => {
                  setConvertingEdgeTypes((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(chunkIndex);
                    return newSet;
                  });
                });
            }
          }
        } else if (field === "nodeLabel") {
          existing.nodeLabel = value;
        } else if (field === "propertyName") {
          existing.propertyName = value;
        } else if (field === "edgePropertyName") {
          existing.edgePropertyName = value;
        } else if (field === "relationshipType") {
          existing.relationshipType = value;
        }
      } else {
        const newMapping: MappingRule = {
          chunkIndex,
          role: "ignore",
        };
        if (field === "nodeLabel") {
          newMapping.nodeLabel = value;
        } else if (field === "propertyName") {
          newMapping.propertyName = value;
        } else if (field === "edgePropertyName") {
          newMapping.edgePropertyName = value;
        } else if (field === "relationshipType") {
          newMapping.relationshipType = value;
        }
        // エッジを選択した時は、切り出したテキストを英語のアッパースネークケースに変換
        if (newMapping.role === "edge") {
          const chunk = chunks[chunkIndex];
          if (chunk) {
            setConvertingEdgeTypes((prev) => new Set(prev).add(chunkIndex));
            convertToEdgeType
              .mutateAsync({ text: chunk.text })
              .then((result) => {
                if (result.data?.edgeType) {
                  setMappings((prevMappings) => {
                    const updated = [...prevMappings];
                    const mappingIndex = updated.findIndex(
                      (m) => m.chunkIndex === chunkIndex,
                    );
                    const mapping =
                      mappingIndex >= 0 ? updated[mappingIndex] : null;
                    if (mapping) {
                      mapping.relationshipType = result.data.edgeType;
                    }
                    return updated;
                  });
                }
              })
              .catch((error) => {
                console.error("Edge type conversion error:", error);
                // エラー時は元のテキストを使用
                setMappings((prevMappings) => {
                  const updated = [...prevMappings];
                  const mappingIndex = updated.findIndex(
                    (m) => m.chunkIndex === chunkIndex,
                  );
                  const mapping =
                    mappingIndex >= 0 ? updated[mappingIndex] : null;
                  if (mapping) {
                    mapping.relationshipType = chunk.text;
                  }
                  return updated;
                });
              })
              .finally(() => {
                setConvertingEdgeTypes((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(chunkIndex);
                  return newSet;
                });
              });
          }
        }
        updated.push(newMapping);
      }
      return updated;
    });
  };

  const handleSave = () => {
    if (chunks.length === 0 || mappings.length === 0) {
      alert("テキストを解析してから保存してください");
      return;
    }

    onSave({
      sampleText,
      chunks,
      mappings,
    });
    setIsOpen(false);
  };

  const getChunkMapping = (chunkIndex: number): MappingRule | undefined => {
    return mappings.find((m) => m.chunkIndex === chunkIndex);
  };

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="抽出形式の設定"
      size="extra-large"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">サンプルテキスト</label>
          <Textarea
            placeholder="例: 2025/12/01（音楽） ..."
            value={sampleText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setSampleText(e.target.value)
            }
            className="min-h-[100px] w-full resize-none rounded-xl bg-slate-800 !p-4 text-base text-white"
          />
          <Button
            onClick={handleAnalyze}
            isLoading={isAnalyzing}
            disabled={!sampleText.trim() || isAnalyzing}
            className="w-fit"
          >
            テキストを解析
          </Button>
        </div>

        {chunks.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="text-sm font-semibold">
              解析結果とマッピング設定
            </div>
            <div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto">
              {chunks.map((chunk, index) => {
                const mapping = getChunkMapping(index);
                const role = mapping?.role ?? chunk.suggestedRole;

                return (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  >
                    <div className="flex flex-row items-center gap-2">
                      <div className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300">
                        {chunk.type}
                      </div>
                      <div className="flex-1 rounded bg-slate-900 px-3 py-2 text-sm text-white">
                        &quot;{chunk.text}&quot;
                      </div>
                    </div>

                    <div className="flex flex-row items-center gap-4">
                      <div className="flex flex-row items-center gap-2">
                        <label className="text-xs text-slate-400">役割:</label>
                        <ListboxInput
                          options={[
                            { value: "node", label: "ノード" },
                            {
                              value: "node_property",
                              label: "ノードのプロパティ",
                            },
                            {
                              value: "edge_property",
                              label: "エッジのプロパティ",
                            },
                            {
                              value: "edge",
                              label: "エッジ",
                            },
                            { value: "ignore", label: "無視" },
                          ]}
                          selected={role}
                          setSelected={(value: string) =>
                            handleMappingChange(
                              index,
                              "role",
                              value as
                                | "node"
                                | "node_property"
                                | "edge_property"
                                | "edge"
                                | "ignore",
                            )
                          }
                          className="w-40"
                        />
                      </div>

                      {role === "node" && (
                        <div className="flex flex-row items-center gap-2">
                          <label className="text-xs text-slate-400">
                            ノードラベル:
                          </label>
                          <TextInput
                            value={mapping?.nodeLabel ?? chunk.type}
                            onChange={(value: string) =>
                              handleMappingChange(index, "nodeLabel", value)
                            }
                            placeholder="例: Date, Event"
                          />
                        </div>
                      )}

                      {role === "node_property" && (
                        <div className="flex flex-row items-center gap-2">
                          <label className="text-xs text-slate-400">
                            プロパティ名:
                          </label>
                          <TextInput
                            value={mapping?.propertyName ?? chunk.type}
                            onChange={(value: string) =>
                              handleMappingChange(index, "propertyName", value)
                            }
                            placeholder="例: date, category"
                          />
                        </div>
                      )}

                      {role === "edge_property" && (
                        <div className="flex flex-row items-center gap-2">
                          <label className="text-xs text-slate-400">
                            エッジのプロパティ名:
                          </label>
                          <TextInput
                            value={mapping?.edgePropertyName ?? chunk.type}
                            onChange={(value: string) =>
                              handleMappingChange(
                                index,
                                "edgePropertyName",
                                value,
                              )
                            }
                            placeholder="例: date, occurredAt"
                          />
                        </div>
                      )}

                      {role === "edge" && (
                        <div className="flex flex-row items-center gap-2">
                          <label className="text-xs text-slate-400">
                            エッジのタイプ:
                          </label>
                          {convertingEdgeTypes.has(index) ? (
                            <div className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-400">
                              変換中...
                            </div>
                          ) : (
                            <div className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white">
                              {mapping?.relationshipType ?? chunk.text}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-row justify-end gap-2">
          <Button
            onClick={() => setIsOpen(false)}
            className="bg-slate-700 hover:bg-slate-600"
          >
            キャンセル
          </Button>
          {chunks.length > 0 && (
            <Button onClick={handleSave}>設定を保存</Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
