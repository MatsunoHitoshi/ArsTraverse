"use client";

import React, { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { AnnotationType } from "@prisma/client";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import { ListboxInput } from "../input/listbox-input";
import { TiptapEditorToolbar } from "./tiptap/tools/tiptap-editor-toolbar";
import type { AnnotationResponse } from "@/app/const/types";

interface AnnotationEditFormProps {
  annotation: AnnotationResponse;
  onClose: () => void;
  onSuccess: () => void;
}

export const AnnotationEditForm: React.FC<AnnotationEditFormProps> = ({
  annotation,
  onClose,
  onSuccess,
}) => {
  const [annotationType, setAnnotationType] = useState<AnnotationType>(
    annotation.type,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content:
      typeof annotation.content === "object" && annotation.content !== null
        ? annotation.content
        : {},
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[100px] p-3 bg-white rounded border",
      },
    },
  });

  const updateAnnotationMutation = api.annotation.updateAnnotation.useMutation({
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      console.error("注釈更新エラー:", error);
      alert("注釈の更新に失敗しました");
    },
  });

  const handleSubmit = async () => {
    if (!editor?.getHTML()) {
      alert("注釈の内容を入力してください");
      return;
    }

    setIsSubmitting(true);

    try {
      const content = editor.getJSON();

      updateAnnotationMutation.mutate({
        annotationId: annotation.id,
        content,
        type: annotationType,
        changeReason: "編集",
      });
    } catch (error) {
      console.error("注釈更新エラー:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const annotationTypeOptions = [
    { value: "COMMENT", label: "コメント" },
    { value: "INTERPRETATION", label: "解釈" },
    { value: "QUESTION", label: "質問" },
    { value: "CLARIFICATION", label: "補足" },
    { value: "CRITICISM", label: "批評" },
    { value: "SUPPORT", label: "支持" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold">注釈を編集</h3>

        {/* 注釈タイプ選択 */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-500">
            注釈の種類
          </label>
          <ListboxInput
            options={annotationTypeOptions}
            selected={annotationType}
            setSelected={(value) => setAnnotationType(value as AnnotationType)}
            placeholder="注釈の種類を選択"
          />
        </div>

        {/* エディター */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-500">
            内容
          </label>
          <div className="rounded-md bg-slate-800">
            <TiptapEditorToolbar
              editor={editor}
              className="border-b border-slate-600 p-2"
            />
            <EditorContent
              editor={editor}
              className="[&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:border-0 [&_.ProseMirror]:border-none [&_.ProseMirror]:bg-slate-800 [&_.ProseMirror]:p-3 [&_.ProseMirror]:text-white [&_.ProseMirror]:outline-none"
            />
          </div>
        </div>

        {/* ボタン */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={onClose}
            disabled={isSubmitting}
            className="border border-gray-300"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !editor?.getHTML()}
          >
            {isSubmitting ? "更新中..." : "更新"}
          </Button>
        </div>
      </div>
    </div>
  );
};
