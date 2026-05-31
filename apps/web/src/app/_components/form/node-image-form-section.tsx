"use client";

import type { CustomNodeType } from "@/app/const/types";
import type { PropertyTypeForFrontend } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "../button/button";
import { api } from "@/trpc/react";
import { TrashIcon } from "../icons";

const NODE_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const IMAGE_KEYS = ["imageUrl", "imageCaption", "imageAlt"] as const;

export const NodeImageFormSection = ({
  topicSpaceId,
  node,
  onSaveSuccess,
}: {
  topicSpaceId: string;
  node: CustomNodeType;
  onSaveSuccess: (updatedNode: CustomNodeType) => void;
}) => {
  const updateProperty = api.topicSpaces.updateGraphProperties.useMutation();
  const uploadNodeImage = api.topicSpaces.uploadNodeImage.useMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageUrl, setImageUrl] = useState<string | undefined>(
    node.properties?.imageUrl as string | undefined,
  );
  const [imageCaption, setImageCaption] = useState<string>(
    node.properties?.imageCaption ?? "",
  );
  const [imageAlt, setImageAlt] = useState<string>(
    node.properties?.imageAlt ?? "",
  );

  useEffect(() => {
    setImageUrl(node.properties?.imageUrl as string | undefined);
    setImageCaption(node.properties?.imageCaption ?? "");
    setImageAlt(node.properties?.imageAlt ?? "");
  }, [
    node.id,
    node.properties?.imageUrl,
    node.properties?.imageCaption,
    node.properties?.imageAlt,
  ]);

  const buildImageProperties = (): PropertyTypeForFrontend => {
    const rest = { ...node.properties };
    IMAGE_KEYS.forEach((k) => delete rest[k]);
    if (imageUrl) {
      return { ...rest, imageUrl, imageCaption, imageAlt };
    }
    return rest;
  };

  const saveImageProperties = () => {
    const properties = buildImageProperties();
    updateProperty.mutate(
      {
        id: topicSpaceId,
        dataJson: {
          relationships: [],
          nodes: [{ ...node, properties }],
        },
      },
      {
        onSuccess: () => {
          onSaveSuccess({ ...node, properties });
        },
        onError: (e) => {
          console.error(e);
          alert(e.message ?? "保存に失敗しました。");
        },
      },
    );
  };

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
            setImageUrl(res.url);
            const nextProperties = {
              ...buildImageProperties(),
              imageUrl: res.url,
              imageCaption,
              imageAlt,
            };
            updateProperty.mutate(
              {
                id: topicSpaceId,
                dataJson: {
                  relationships: [],
                  nodes: [{ ...node, properties: nextProperties }],
                },
              },
              {
                onSuccess: () => {
                  onSaveSuccess({ ...node, properties: nextProperties });
                },
                onError: (err) => {
                  alert(err.message ?? "保存に失敗しました。");
                },
              },
            );
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
    const properties = { ...node.properties };
    IMAGE_KEYS.forEach((k) => delete properties[k]);
    setImageUrl(undefined);
    setImageCaption("");
    setImageAlt("");
    updateProperty.mutate(
      {
        id: topicSpaceId,
        dataJson: {
          relationships: [],
          nodes: [{ ...node, properties }],
        },
      },
      {
        onSuccess: () => {
          onSaveSuccess({ ...node, properties });
        },
        onError: (e) => {
          alert(e.message ?? "削除に失敗しました。");
        },
      },
    );
  };

  const hasChanges =
    imageUrl !== (node.properties?.imageUrl as string | undefined) ||
    imageCaption !== (node.properties?.imageCaption ?? "") ||
    imageAlt !== (node.properties?.imageAlt ?? "");

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-600 p-3">
      <span className="text-sm font-medium text-slate-300">ノード画像</span>
      {imageUrl ? (
        <>
          <div className="relative aspect-square w-full max-w-[200px] overflow-hidden rounded">
            <Image
              src={imageUrl}
              alt={imageAlt || node.name}
              fill
              className="object-cover"
              sizes="200px"
            />
            <Button
              className="!absolute -right-2 -top-2 !p-1"
              onClick={handleRemoveImage}
              type="button"
              disabled={updateProperty.isPending}
            >
              <TrashIcon height={16} width={16} />
            </Button>
          </div>
          <input
            type="text"
            placeholder="キャプション（任意）"
            className="w-full rounded-md bg-slate-600 px-2 py-1 text-sm text-slate-50"
            value={imageCaption}
            onChange={(e) => setImageCaption(e.target.value)}
          />
          <input
            type="text"
            placeholder="代替テキスト（任意・アクセシビリティ）"
            className="w-full rounded-md bg-slate-600 px-2 py-1 text-sm text-slate-50"
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
          />
          {hasChanges && (
            <Button
              type="button"
              className="!p-2 !text-sm"
              onClick={saveImageProperties}
              disabled={updateProperty.isPending}
            >
              {updateProperty.isPending ? "保存中…" : "キャプションを保存"}
            </Button>
          )}
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
          <span className="text-xs text-slate-400">
            10MB以内（JPEG/PNG/WebP/GIF）
          </span>
        </div>
      )}
    </div>
  );
};
