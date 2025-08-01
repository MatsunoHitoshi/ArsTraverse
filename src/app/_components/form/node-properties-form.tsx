import type { PropertyTypeForFrontend } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type { CustomNodeType } from "@/app/const/types";
import React, { useState } from "react";
import { Button } from "../button/button";
import { api } from "@/trpc/react";
import { PlusIcon, TrashIcon } from "../icons";
import { Textarea } from "../textarea";

export const NodePropertiesForm = ({
  topicSpaceId,
  node,
  refetch,
  setIsEditing,
  width = "long",
}: {
  topicSpaceId: string;
  node: CustomNodeType;
  refetch: () => void;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  className?: string;
  width?: "short" | "long";
}) => {
  const updateProperty = api.topicSpaces.updateGraphProperties.useMutation();
  const [properties, setProperties] = useState<PropertyTypeForFrontend>(
    node.properties,
  );

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
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(properties).map(([key, value], index) => {
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
        <Button className="!p-1 !text-sm" onClick={submit}>
          保存
        </Button>
      </div>
    </div>
  );
};
