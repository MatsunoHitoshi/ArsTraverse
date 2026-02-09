import type { PropertyTypeForFrontend } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type { CustomNodeType } from "@/app/const/types";
import React, { useRef, useState } from "react";
import { Button } from "../button/button";
import { api } from "@/trpc/react";
import { PlusIcon, TrashIcon, FileTextIcon } from "../icons";
import { Textarea } from "../textarea";
import { ProposalCreateForm } from "../graph-edit-proposal/proposal-create-form";

const NODE_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const IMAGE_KEYS = ["imageUrl", "imageCaption", "imageAlt"] as const;

export const NodePropertiesForm = ({
  topicSpaceId,
  node,
  refetch,
  setIsEditing,
  width = "long",
  enableProposalMode = false,
}: {
  topicSpaceId: string;
  node: CustomNodeType;
  refetch: () => void;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  className?: string;
  width?: "short" | "long";
  enableProposalMode?: boolean;
}) => {
  const updateProperty = api.topicSpaces.updateGraphProperties.useMutation();
  const uploadNodeImage = api.topicSpaces.uploadNodeImage.useMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [properties, setProperties] = useState<PropertyTypeForFrontend>(
    node.properties,
  );
  const [showProposalForm, setShowProposalForm] = useState(false);

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > NODE_IMAGE_MAX_BYTES) {
      alert("画像サイズは10MB以内にしてください。");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (!dataUrl.startsWith("data:image/")) {
        alert("画像ファイルを選択してください。");
        return;
      }
      uploadNodeImage.mutate(
        { dataUrl, topicSpaceId },
        {
          onSuccess: (res) => {
            setProperties((p) => ({ ...p, imageUrl: res.url }));
          },
          onError: (err) => {
            alert(err.message ?? "アップロードに失敗しました。");
          },
        },
      );
    };
    e.target.value = "";
  };

  const handleRemoveImage = () => {
    setProperties((p) => {
      const next = { ...p };
      IMAGE_KEYS.forEach((k) => delete next[k]);
      return next;
    });
  };

  const submit = () => {
    updateProperty.mutate(
      {
        id: topicSpaceId,
        dataJson: {
          relationships: [],
          nodes: [{ ...node, properties: properties }],
        },
      },
      {
        onSuccess: (_res) => {
          refetch();
          setIsEditing(false);
        },
        onError: (e) => {
          console.log(e);
        },
      },
    );
  };

  const handleCreateProposal = () => {
    setShowProposalForm(true);
  };

  const handleProposalSuccess = () => {
    setShowProposalForm(false);
    setIsEditing(false);
  };

  const handleProposalCancel = () => {
    setShowProposalForm(false);
  };

  // 新しいグラフデータを生成
  const generateNewGraphData = () => {
    return {
      nodes: [{ ...node, properties: properties }],
      relationships: [],
    };
  };

  if (showProposalForm) {
    return (
      <ProposalCreateForm
        topicSpaceId={topicSpaceId}
        newGraphData={generateNewGraphData()}
        onSuccess={handleProposalSuccess}
        onCancel={handleProposalCancel}
      />
    );
  }
  const otherProperties = Object.entries(properties).filter(
    ([key]) => !IMAGE_KEYS.includes(key as (typeof IMAGE_KEYS)[number]),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-md border border-slate-600 p-3">
        <span className="text-sm font-medium text-slate-300">ノード画像</span>
        {properties.imageUrl ? (
          <>
            <div className="relative inline-block w-full max-w-[200px]">
              <img
                src={properties.imageUrl}
                alt={properties.imageAlt ?? node.name}
                className="h-auto w-full rounded object-cover"
              />
              <Button
                className="!absolute -right-2 -top-2 !p-1"
                onClick={handleRemoveImage}
                type="button"
              >
                <TrashIcon height={16} width={16} />
              </Button>
            </div>
            <input
              type="text"
              placeholder="キャプション（任意）"
              className="w-full rounded-md bg-slate-600 px-2 py-1 text-sm text-slate-50"
              value={properties.imageCaption ?? ""}
              onChange={(e) =>
                setProperties((p) => ({
                  ...p,
                  imageCaption: e.target.value,
                }))
              }
            />
            <input
              type="text"
              placeholder="代替テキスト（任意・アクセシビリティ）"
              className="w-full rounded-md bg-slate-600 px-2 py-1 text-sm text-slate-50"
              value={properties.imageAlt ?? ""}
              onChange={(e) =>
                setProperties((p) => ({ ...p, imageAlt: e.target.value }))
              }
            />
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageFileSelect}
            />
            <Button
              type="button"
              className="!p-2 !text-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadNodeImage.isPending}
            >
              {uploadNodeImage.isPending ? "アップロード中…" : "画像を選択"}
            </Button>
            <span className="text-xs text-slate-400">10MB以内（JPEG/PNG/WebP/GIF）</span>
          </div>
        )}
      </div>

      {otherProperties.map(([key, value], index) => {
        return (
          <div className="flex w-full flex-col gap-2" key={index}>
            <div className="flex w-full flex-row items-start gap-1">
              <input
                type="text"
                className="w-[96px] rounded-md bg-slate-600 px-2 py-1 text-sm text-slate-50 backdrop-blur-2xl focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400"
                id={`key-${index}`}
                name={`key-${index}`}
                defaultValue={key}
                onChange={(e) => {
                  const prevKey = key;
                  const newKey = e.target.value;
                  const newProperties = { ...properties };
                  newProperties[newKey] = properties[prevKey] ?? "";
                  delete newProperties[prevKey];
                  setProperties(newProperties);
                }}
              />
              <div>:</div>
              {width === "short" ? (
                <input
                  type="text"
                  className="w-full rounded-md bg-slate-600 p-1 text-sm text-slate-50 backdrop-blur-2xl focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400"
                  id={`value-${index}`}
                  name={`value-${index}`}
                  defaultValue={String(value)}
                  onChange={(e) => {
                    const newProperties = { ...properties };
                    newProperties[key] = e.target.value;
                    setProperties(newProperties);
                  }}
                />
              ) : (
                <Textarea
                  placeholder="テキストを入力"
                  autoFocus={true}
                  className="min-h-[194px] w-full resize-none rounded-md bg-slate-600 !p-4 text-sm outline-none"
                  defaultValue={String(value)}
                  onChange={(e) => {
                    const newProperties = { ...properties };
                    newProperties[key] = e.target.value;
                    setProperties(newProperties);
                  }}
                />
              )}

              <Button
                className="!ml-4 !p-1"
                onClick={() =>
                  setProperties((p) => {
                    const { [key]: _, ...rest } = p;
                    return rest;
                  })
                }
              >
                <TrashIcon height={18} width={18} />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-row items-center justify-end gap-2">
        <Button
          className="!p-1"
          onClick={() =>
            setProperties((p) => {
              console.log(p);
              return { ...p, [""]: "" };
            })
          }
        >
          <PlusIcon height={18} width={18} />
        </Button>

        {enableProposalMode && (
          <Button
            className="flex flex-row items-center gap-1 !p-1 !text-sm"
            onClick={handleCreateProposal}
          >
            <FileTextIcon height={18} width={18} />
            変更提案
          </Button>
        )}

        <Button className="!p-1 !text-sm" onClick={submit}>
          保存
        </Button>
      </div>
    </div>
  );
};
