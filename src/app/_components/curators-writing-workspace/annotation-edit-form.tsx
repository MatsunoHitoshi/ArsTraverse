"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("annotation");
  const tCommon = useTranslations("common");
  const [annotationType, setAnnotationType] = useState<AnnotationType>(
    annotation.type,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const annotationTypeOptions = useMemo(
    () => [
      { value: "COMMENT", label: t("comment") },
      { value: "INTERPRETATION", label: t("interpretation") },
      { value: "QUESTION", label: t("question") },
      { value: "CLARIFICATION", label: t("clarification") },
      { value: "CRITICISM", label: t("criticism") },
      { value: "SUPPORT", label: t("support") },
    ],
    [t],
  );

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
      alert(t("updateFailed"));
    },
  });

  const handleSubmit = async () => {
    if (!editor?.getHTML()) {
      alert(t("contentRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      const content = editor.getJSON();

      updateAnnotationMutation.mutate({
        annotationId: annotation.id,
        content,
        type: annotationType,
        changeReason: t("editChangeReason"),
      });
    } catch (error) {
      console.error("注釈更新エラー:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold">{t("editAnnotation")}</h3>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-500">
            {t("annotationType")}
          </label>
          <ListboxInput
            options={annotationTypeOptions}
            selected={annotationType}
            setSelected={(value) => setAnnotationType(value as AnnotationType)}
            placeholder={t("selectAnnotationType")}
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-500">
            {t("content")}
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

        <div className="flex justify-end gap-2">
          <Button
            onClick={onClose}
            disabled={isSubmitting}
            className="border border-gray-300"
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !editor?.getHTML()}
          >
            {isSubmitting ? tCommon("updating") : tCommon("update")}
          </Button>
        </div>
      </div>
    </div>
  );
};
