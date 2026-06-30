"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { AnnotationType } from "@prisma/client";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import { ListboxInput } from "../input/listbox-input";
import { TiptapEditorToolbar } from "./tiptap/tools/tiptap-editor-toolbar";
import { Modal } from "../modal/modal";

interface AnnotationFormProps {
  targetType: "node" | "edge" | "annotation";
  targetId: string;
  topicSpaceId: string;
  parentAnnotationId?: string | null;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSuccess: () => void;
  defaultAnnotationType?: AnnotationType;
  defaultAnnotationContent?: string;
}

export const AnnotationForm: React.FC<AnnotationFormProps> = ({
  defaultAnnotationType = "COMMENT",
  defaultAnnotationContent = "",
  targetType,
  targetId,
  topicSpaceId,
  parentAnnotationId,
  isOpen,
  setIsOpen,
  onSuccess,
}) => {
  if (parentAnnotationId)
    console.log("parentAnnotationId: ", parentAnnotationId);
  const t = useTranslations("annotation");
  const tCommon = useTranslations("common");
  const [annotationType, setAnnotationType] = useState<AnnotationType>(
    defaultAnnotationType,
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
    content: defaultAnnotationContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[100px] p-3 bg-white rounded border",
      },
    },
  });

  useEffect(() => {
    if (defaultAnnotationContent) {
      editor?.commands.setContent(defaultAnnotationContent);
    }
  }, [defaultAnnotationContent]);

  const createAnnotationMutation = api.annotation.createAnnotation.useMutation({
    onSuccess: () => {
      onSuccess();
      setIsOpen(false);
    },
    onError: (error) => {
      console.error("注釈作成エラー:", error);
      alert(t("createFailed"));
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

      createAnnotationMutation.mutate({
        content,
        type: annotationType,
        targetNodeId: targetType === "node" ? targetId : undefined,
        targetRelationshipId: targetType === "edge" ? targetId : undefined,
        parentAnnotationId: parentAnnotationId ?? undefined,
        topicSpaceId,
      });
    } catch (error) {
      console.error("注釈作成エラー:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={parentAnnotationId ? t("addReply") : t("addNewAnnotation")}
      size="extra-large"
    >
      <div className="flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-500">
              {t("annotationType")}
            </label>
            <ListboxInput
              options={annotationTypeOptions}
              selected={annotationType}
              setSelected={(value) =>
                setAnnotationType(value as AnnotationType)
              }
              placeholder={t("selectAnnotationType")}
            />
          </div>

          <div className="mb-4">
            <div className="rounded-md bg-slate-800">
              <TiptapEditorToolbar
                editor={editor}
                className="border-b border-slate-600 p-2"
              />
              <EditorContent
                editor={editor}
                className="[&_.ProseMirror]:max-h-[300px] [&_.ProseMirror]:min-h-[150px] [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror]:border-0 [&_.ProseMirror]:border-none [&_.ProseMirror]:bg-slate-800 [&_.ProseMirror]:p-3 [&_.ProseMirror]:text-white [&_.ProseMirror]:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-600 pt-4">
          <Button
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
            className="border border-gray-300"
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !editor?.getHTML()}
          >
            {isSubmitting ? tCommon("creating") : tCommon("create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
