"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Modal } from "@/app/_components/modal/modal";
import { Button } from "@/app/_components/button/button";
import { TextInput } from "@/app/_components/input/text-input";
import type { PropertyTypeForFrontend } from "@/app/const/types";

function getDescription(properties: PropertyTypeForFrontend | undefined): string {
  return properties?.description?.trim() ?? "";
}

function withDescription(
  properties: PropertyTypeForFrontend | undefined,
  description: string,
): PropertyTypeForFrontend {
  const trimmed = description.trim();
  const safeProperties = properties ?? {};
  if (!trimmed) {
    const next = { ...safeProperties };
    delete next.description;
    return next;
  }
  return { ...safeProperties, description: trimmed };
}

export type GraphNodeEditPayload = {
  kind: "node";
  id: string;
  name: string;
  label: string;
  properties: PropertyTypeForFrontend;
};

export type GraphRelationshipEditPayload = {
  kind: "relationship";
  id: string;
  type: string;
  properties: PropertyTypeForFrontend;
  sourceName: string;
  targetName: string;
};

export type GraphItemEditPayload =
  | GraphNodeEditPayload
  | GraphRelationshipEditPayload;

type GraphSummaryEditModalProps = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  item: GraphItemEditPayload | null;
  onSave: (item: GraphItemEditPayload) => void;
};

export function GraphSummaryEditModal({
  isOpen,
  setIsOpen,
  item,
  onSave,
}: GraphSummaryEditModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !item) return;
    setErrorMessage(null);
    if (item.kind === "node") {
      setName(item.name);
      setType("");
      setDescription(getDescription(item.properties));
    } else {
      setName("");
      setType(item.type);
      setDescription(getDescription(item.properties));
    }
  }, [isOpen, item]);

  const handleSave = () => {
    if (!item) return;

    if (item.kind === "node") {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setErrorMessage("ノード名を入力してください");
        return;
      }
      onSave({
        ...item,
        name: trimmedName,
        properties: withDescription(item.properties, description),
      });
    } else {
      const trimmedType = type.trim();
      if (!trimmedType) {
        setErrorMessage("関係タイプを入力してください");
        return;
      }
      onSave({
        ...item,
        type: trimmedType,
        properties: withDescription(item.properties, description),
      });
    }

    setIsOpen(false);
  };

  if (!item) return null;

  const title = item.kind === "node" ? "ノードを編集" : "関係を編集";

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={title}>
      <div className="flex flex-col gap-4">
        {item.kind === "relationship" && (
          <p className="text-sm text-slate-300">
            {item.sourceName} → {item.targetName}
          </p>
        )}

        {item.kind === "node" ? (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-200">ノード名</label>
            <TextInput
              value={name}
              onChange={setName}
              placeholder="ノード名"
            />
            {item.label ? (
              <p className="text-xs text-slate-500">ラベル: {item.label}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-200">関係タイプ</label>
            <TextInput
              value={type}
              onChange={setType}
              placeholder="例: 関連, 影響"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-200">解説・メモ</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="現地調査のメモや補足説明（properties.description に保存）"
            className="w-full resize-y rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-orange-400/50 focus:ring-2"
          />
        </div>

        {errorMessage && (
          <p className="text-sm text-red-300">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            className="!text-small !p-1 text-slate-400"
            onClick={() => setIsOpen(false)}
          >
            キャンセル
          </Button>
          <Button className="!text-small !p-1" onClick={handleSave}>
            OK
          </Button>
        </div>
      </div>
    </Modal>
  );
}
