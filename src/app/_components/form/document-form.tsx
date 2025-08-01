import { useRef, useState } from "react";
import type { SetStateAction } from "react";
import { FileUploader } from "../file-uploader/file-uploader";
import { Button } from "../button/button";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { api } from "@/trpc/react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Switch } from "@headlessui/react";
import { Textarea } from "../textarea";
import type { Document } from "@langchain/core/documents";
import { DocumentUploadTipsModal } from "../tips/document-upload-tips-modal";

type DocumentFormProps = {
  file: File | null;
  setFile: React.Dispatch<SetStateAction<File | null>>;
  setGraphDocument: React.Dispatch<
    SetStateAction<GraphDocumentForFrontend | null>
  >;
  setDocumentUrl: React.Dispatch<SetStateAction<string | null>>;
  documentUrl: string | null;
};

export const DocumentForm = ({
  file,
  setFile,
  setGraphDocument,
  setDocumentUrl,
  documentUrl,
}: DocumentFormProps) => {
  const [isPlaneTextMode, setIsPlaneTextMode] = useState<boolean>(false);
  const [text, setText] = useState<string>();
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [inspectResult, setInspectResult] = useState<Document[]>([]);
  const [isOpenTips, setIsOpenTips] = useState<boolean>(false);

  const extractKG = api.kg.extractKG.useMutation();
  const textInspect = api.kg.textInspect.useMutation();

  const extract = (fileUrl: string) => {
    setIsProcessing(true);

    extractKG.mutate(
      {
        fileUrl: fileUrl,
        extractMode: "langChain",
        isPlaneTextMode: isPlaneTextMode,
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

    let fileUrl: string | undefined;
    const reader = new FileReader();

    if (isPlaneTextMode) {
      if (!text) {
        alert("テキストが入力されていません。");
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
        alert("アップロード中にエラーが発生しました。");
        setIsProcessing(false);
      }
    } else {
      if (!file) {
        alert("ファイルが選択されていません。");
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
        alert("アップロード中にエラーが発生しました。");
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
          <div className="text-3xl font-semibold">文書の内容を可視化</div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-xl">
              pdfまたは手入力で文書をアップロードできます
            </div>
            <div className="text-sm text-orange-600">
              注意：機密情報・個人情報を含む文書は絶対にアップロードしないでください
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-8">
          {isPlaneTextMode ? (
            <>
              <Textarea
                placeholder="テキストを入力"
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
                      大きなファイルを読み込ませるときのTips
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-row items-center gap-2">
            <div className="text-sm">手入力モード</div>
            <div className="flex flex-row items-center gap-8">
              <Switch
                disabled={isProcessing}
                checked={isPlaneTextMode}
                onChange={setIsPlaneTextMode}
                className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
              >
                <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
              </Switch>
              {((!!text && isPlaneTextMode) || (file && !isPlaneTextMode)) && (
                <div className="flex flex-row justify-end">
                  {isPlaneTextMode || inspectResult.length > 0 ? (
                    <Button type="submit" isLoading={isProcessing}>
                      概念グラフを抽出する
                    </Button>
                  ) : (
                    <Button type="submit" isLoading={isProcessing}>
                      テキストを抽出する
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {inspectResult.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <div className="font-semibold">テキスト情報</div>
              <div className="flex h-96 flex-col items-center gap-2 overflow-y-scroll rounded-xl border border-slate-300">
                <div className="flex flex-col items-center gap-2 p-8">
                  {inspectResult.map((result, index) => (
                    <div key={index}>{result.pageContent}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </form>
      <DocumentUploadTipsModal isOpen={isOpenTips} setIsOpen={setIsOpenTips} />
    </>
  );
};
