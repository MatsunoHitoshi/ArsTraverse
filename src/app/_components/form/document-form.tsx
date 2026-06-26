"use client";
import { useRef, useState } from "react";
import type { SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { FileUploader } from "../file-uploader/file-uploader";
import { Button } from "../button/button";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { api } from "@/trpc/react";
import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { Switch } from "@headlessui/react";
import { Textarea } from "../textarea";
import type { Document } from "@langchain/core/documents";
import { DocumentUploadTipsModal } from "../tips/document-upload-tips-modal";
import { ListboxInput } from "../input/listbox-input";
import { SchemaBuilderModal } from "../kg/schema-builder/schema-builder-modal";
import type { CustomMappingRules } from "@/server/lib/extractors/base";

type DocumentFormProps = {
  file: File | null;
  setFile: React.Dispatch<SetStateAction<File | null>>;
  setGraphDocument: React.Dispatch<
    SetStateAction<GraphDocumentForFrontend | null>
  >;
  setDocumentUrl: React.Dispatch<SetStateAction<string | null>>;
  documentUrl: string | null;
};

const BATCH_SIZE = 5;

export const DocumentForm = ({
  file,
  setFile,
  setGraphDocument,
  setDocumentUrl,
  documentUrl,
}: DocumentFormProps) => {
  const t = useTranslations("document");
  const [isPlaneTextMode, setIsPlaneTextMode] = useState<boolean>(false);
  const [extractMode, setExtractMode] = useState<string>("iterative");
  const [text, setText] = useState<string>();
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<string>("");
  const [inspectResult, setInspectResult] = useState<Document[]>([]);
  const [isOpenTips, setIsOpenTips] = useState<boolean>(false);
  const [isOpenSchemaBuilder, setIsOpenSchemaBuilder] =
    useState<boolean>(false);
  const [customMappingRules, setCustomMappingRules] = useState<
    CustomMappingRules | undefined
  >(undefined);

  const extractKG = api.kg.extractKG.useMutation();
  const textInspect = api.kg.textInspect.useMutation();
  const extractPhase1 = api.kg.extractPhase1.useMutation();
  const extractPhase2 = api.kg.extractPhase2.useMutation();
  const finalizeGraph = api.kg.finalizeGraph.useMutation();

  const extractIteratively = async (fileUrl: string) => {
    setIsProcessing(true);
    setProgress(t("parsingDocument"));

    try {
      // 1. Inspect text to get chunks
      const inspectRes = await textInspect.mutateAsync({
        fileUrl,
        isPlaneTextMode,
      });

      if (!inspectRes.data.documents) {
        throw new Error(t("parseFailed"));
      }

      const documents = inspectRes.data.documents;
      let accumulatedNodes: NodeTypeForFrontend[] = [];
      let accumulatedRelationships: RelationshipTypeForFrontend[] = [];

      // 2. Phase 1 Loop
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        setProgress(
          t("phase1Progress", {
            current: Math.min(i + BATCH_SIZE, documents.length),
            total: documents.length,
          }),
        );

        const res = await extractPhase1.mutateAsync({
          documents: batch,
          customMappingRules,
          // schema, additionalPrompt could be added here if needed
        });

        if (res.data) {
          accumulatedNodes = [...accumulatedNodes, ...res.data.nodes];
          accumulatedRelationships = [
            ...accumulatedRelationships,
            ...res.data.relationships,
          ];
        }
      }

      // Deduplicate nodes for context
      const uniqueNodesMap = new Map<string, NodeTypeForFrontend>();
      accumulatedNodes.forEach((n) => {
        if (!uniqueNodesMap.has(n.name)) uniqueNodesMap.set(n.name, n);
      });
      const uniqueNodes = Array.from(uniqueNodesMap.values());

      // Build Context
      const contextString = uniqueNodes
        .map((n) => {
          const ja = n.properties?.name_ja ? `(${n.properties.name_ja})` : "";
          return `- ${n.name} [${n.label}] ${ja}`;
        })
        .join("\n");

      // 3. Phase 2 Loop
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        setProgress(
          t("phase2Progress", {
            current: Math.min(i + BATCH_SIZE, documents.length),
            total: documents.length,
          }),
        );

        const res = await extractPhase2.mutateAsync({
          documents: batch,
          contextualInfo: contextString,
          customMappingRules,
        });

        if (res.data) {
          // We only care about new relationships mostly, but we collect everything and deduplicate later
          accumulatedNodes = [...accumulatedNodes, ...res.data.nodes];
          accumulatedRelationships = [
            ...accumulatedRelationships,
            ...res.data.relationships,
          ];
        }
      }

      // 4. Finalize
      setProgress(t("buildingGraph"));
      const finalRes = await finalizeGraph.mutateAsync({
        nodes: accumulatedNodes,
        relationships: accumulatedRelationships,
      });

      if (finalRes.data.graph) {
        setGraphDocument(finalRes.data.graph);
      }

      setIsProcessing(false);
      setProgress("");
    } catch (error) {
      console.error(error);
      alert(t("processingError"));
      setIsProcessing(false);
      setProgress("");
    }
  };

  const extract = (fileUrl: string) => {
    if (extractMode === "iterative") {
      void extractIteratively(fileUrl);
      return;
    }

    setIsProcessing(true);
    extractKG.mutate(
      {
        fileUrl: fileUrl,
        extractMode: extractMode,
        isPlaneTextMode: isPlaneTextMode,
        customMappingRules: customMappingRules,
      },
      {
        onSuccess: (res) => {
          console.log("res client", res);
          if (res.data.graph) {
            setGraphDocument(res.data.graph);
          }
          setIsProcessing(false);
        },
        onError: (e) => {
          console.log(e);
          setIsProcessing(false);
        },
      },
    );
  };

  const inspect = (fileUrl: string) => {
    setIsProcessing(true);
    textInspect.mutate(
      {
        fileUrl: fileUrl,
        isPlaneTextMode: isPlaneTextMode,
      },
      {
        onSuccess: (res) => {
          if (res.data.documents) {
            setInspectResult(res.data.documents);
            console.log("inspectResult", res.data.documents);
          }
          setIsProcessing(false);
        },
        onError: (e) => {
          console.log(e);
          setIsProcessing(false);
        },
      },
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let fileUrl: string | null | undefined;
    const reader = new FileReader();

    if (isPlaneTextMode) {
      if (!text) {
        alert(t("noTextEntered"));
        return;
      }
      try {
        setIsProcessing(true);
        console.log("planeTextMode");
        const textBlob = new Blob([text], {
          type: "text/plain; charset=utf-8",
        });
        const textFile = new File([textBlob], `input_${Date.now()}.txt`, {
          type: "text/plain; charset=utf-8",
        });
        setFile(textFile);
        reader.readAsDataURL(textFile);
        reader.onload = async () => {
          // const base64Text = reader.result?.toString();
          if (textBlob) {
            fileUrl = await storageUtils.uploadFromBlob(
              textBlob,
              BUCKETS.PATH_TO_INPUT_TXT,
            );
            if (fileUrl) {
              setDocumentUrl(fileUrl);
              extract(fileUrl);
            }
          } else {
            console.log("Failed to convert");
            setIsProcessing(false);
          }
        };
      } catch (error) {
        console.error("アップロード中にエラーが発生しました", error);
        alert(t("uploadError"));
        setIsProcessing(false);
      }
    } else {
      if (!file) {
        alert(t("noFileSelected"));
        return;
      }
      try {
        setIsProcessing(true);
        if (documentUrl) {
          extract(documentUrl);
        } else {
          reader.readAsDataURL(file);
          reader.onload = async () => {
            const base64Data = reader.result?.toString();
            if (base64Data) {
              fileUrl = await storageUtils.uploadFromDataURL(
                base64Data,
                BUCKETS.PATH_TO_INPUT_PDF,
              );
              if (fileUrl) {
                setDocumentUrl(fileUrl);
                inspect(fileUrl);
              }
            } else {
              console.log("Failed to convert");
              setIsProcessing(false);
            }
          };
        }
      } catch (error) {
        console.error("アップロード中にエラーが発生しました", error);
        alert(t("uploadError"));
        setIsProcessing(false);
      }
    }
  };

  return (
    <>
      <form
        encType="multipart/form-data"
        onSubmit={submit}
        className="flex w-full flex-col items-center gap-16"
      >
        <div className="flex flex-col items-center gap-8">
          <div className="text-3xl font-semibold">{t("visualizeTitle")}</div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-xl">{t("uploadHint")}</div>
            <div className="text-sm text-orange-600">{t("privacyWarning")}</div>
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-8">
          {isPlaneTextMode ? (
            <>
              <Textarea
                placeholder={t("textPlaceholder")}
                autoFocus={true}
                className="min-h-[194px] w-full resize-none rounded-xl bg-slate-500 !p-4 text-base"
                defaultValue={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
              />
            </>
          ) : (
            <>
              {inspectResult.length > 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="font-semibold">{t("extractedTextTitle")}</div>
                  <div className="flex h-96 flex-col items-center gap-2 overflow-y-scroll rounded-xl border border-slate-300">
                    <div className="flex flex-col items-center gap-2 p-8">
                      {inspectResult.map((result, index) => (
                        <div key={index}>{result.pageContent}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex w-full flex-col items-center gap-3">
                    <FileUploader
                      name="target-file"
                      inputRef={fileInputRef}
                      setFile={setFile}
                      file={file}
                    />
                    <div className="flex flex-col items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpenTips(!isOpenTips);
                        }}
                      >
                        <div className="text-xs underline hover:no-underline">
                          {t("largeFileTips")}
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex flex-row items-center gap-2">
            <div className="text-sm">{t("manualInputMode")}</div>
            <div className="flex flex-row items-center gap-8">
              <Switch
                disabled={isProcessing}
                checked={isPlaneTextMode}
                onChange={setIsPlaneTextMode}
                className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
              >
                <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
              </Switch>
              {process.env.NODE_ENV === "development" && (
                <div className="flex flex-row items-center gap-2">
                  <div className="text-sm">{t("extractMode")}</div>
                  <ListboxInput
                    options={[
                      { value: "langChain", label: t("extractModeStandard") },
                      { value: "iterative", label: t("extractModeIterative") },
                      {
                        value: "assistants",
                        label: t("extractModeAssistants"),
                      },
                    ]}
                    selected={extractMode}
                    setSelected={setExtractMode}
                    disabled={isProcessing}
                    className="w-60"
                  />
                </div>
              )}

              <div className="flex flex-row items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setIsOpenSchemaBuilder(true)}
                  disabled={isProcessing}
                  className="bg-slate-700 text-sm hover:bg-slate-600"
                >
                  {customMappingRules
                    ? t("schemaConfigured")
                    : t("schemaConfigure")}
                </Button>
              </div>
              {((!!text && isPlaneTextMode) || (file && !isPlaneTextMode)) && (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-row justify-end">
                    {isPlaneTextMode || inspectResult.length > 0 ? (
                      <Button type="submit" isLoading={isProcessing}>
                        {t("buildGraph")}
                      </Button>
                    ) : (
                      <Button type="submit" isLoading={isProcessing}>
                        {t("extractText")}
                      </Button>
                    )}
                  </div>
                  {progress && (
                    <div className="animate-pulse text-xs text-slate-600">
                      {progress}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
      <DocumentUploadTipsModal isOpen={isOpenTips} setIsOpen={setIsOpenTips} />
      <SchemaBuilderModal
        isOpen={isOpenSchemaBuilder}
        setIsOpen={setIsOpenSchemaBuilder}
        onSave={(rules) => {
          setCustomMappingRules(rules);
        }}
      />
    </>
  );
};
