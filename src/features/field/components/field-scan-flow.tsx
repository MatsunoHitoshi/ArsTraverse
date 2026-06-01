"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { GraphPreview } from "@/app/_components/curators-writing-workspace/graph-preview";
import { LinkButton } from "@/app/_components/button/link-button";
import { ChevronLeftIcon } from "@/app/_components/icons";
import { GraphSummary } from "@/features/field/components/graph-summary";
import { LiveCameraScanner } from "@/features/field/components/live-camera-scanner";
import { ScanRegionSelector } from "@/features/field/components/scan-region-selector";
import {
  DEFAULT_OCR_REGION,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";
import {
  getOcrStatusLabel,
  runOcrOnRegions,
  type OcrLanguage,
  type OcrProgressUpdate,
} from "@/features/field/ocr/tesseract-client";

const LANGUAGE_OPTIONS: { value: OcrLanguage; label: string }[] = [
  { value: "jpn", label: "日本語（横書き）" },
  { value: "jpn_vert", label: "日本語（縦書き）" },
  { value: "eng", label: "English" },
];

type ScanStep = "camera" | "trim" | "processing" | "preview";
type PipelineStage = "ocr" | "normalize" | "graph" | null;

export function FieldScanFlow() {
  const router = useRouter();
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ScanStep>("camera");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [plainText, setPlainText] = useState("");
  const [graphPreview, setGraphPreview] = useState<GraphDocumentForFrontend | null>(
    null,
  );
  const [ocrRegions, setOcrRegions] = useState<NormalizedOcrRegion[]>([
    DEFAULT_OCR_REGION,
  ]);
  const [language, setLanguage] = useState<OcrLanguage>("jpn");
  const [ocrProgress, setOcrProgress] = useState<OcrProgressUpdate | null>(
    null,
  );
  const [ocrMetadata, setOcrMetadata] = useState<
    Record<string, unknown> | undefined
  >();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [isNormalizingText, setIsNormalizingText] = useState(false);
  const [isRunningGraph, setIsRunningGraph] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>(null);
  const [pipelineProgress, setPipelineProgress] = useState(0);

  const createFromScan = api.scan.createFromScan.useMutation({
    onSuccess: (result) => {
      router.push(`/field/scan/${result.sourceDocument.id}`);
    },
    onError: (error) => {
      setErrorMessage(error.message ?? "グラフ作成に失敗しました");
    },
  });
  const normalizeOcrText = api.scan.normalizeOcrText.useMutation();
  const extractGraphFromPlainText = api.kg.extractKGFromPlainText.useMutation();
  const previewMatchNodeNames = useMemo(
    () => graphPreview?.nodes.map((node) => node.name).filter(Boolean) ?? [],
    [graphPreview],
  );
  const { data: previewMatchCandidates = [] } =
    api.scan.searchNodeMatchesByNames.useQuery(
      {
        nodeNames: previewMatchNodeNames,
        limit: Math.min(Math.max(previewMatchNodeNames.length * 5, 20), 100),
      },
      {
        enabled: step === "preview" && previewMatchNodeNames.length > 0,
      },
    );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const canSubmit = useMemo(
    () =>
      sessionName.trim().length > 0 &&
      plainText.trim().length > 0 &&
      graphPreview != null,
    [sessionName, plainText, graphPreview],
  );
  const isPipelineRunning =
    isRunningOcr || isNormalizingText || isRunningGraph || pipelineStage != null;

  const pipelineLabel = useMemo(() => {
    if (pipelineStage === "ocr") {
      return ocrProgress
        ? `${getOcrStatusLabel(ocrProgress)}${
            ocrProgress.status === "recognizing text"
              ? ` ${Math.round(ocrProgress.progress * 100)}%`
              : ""
          }`
        : "OCR を実行中...";
    }
    if (pipelineStage === "normalize") return "AIでテキストを整形中...";
    if (pipelineStage === "graph") return "グラフを抽出中...";
    return "";
  }, [pipelineStage, ocrProgress]);

  const setSelectedImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMessage("画像ファイルを選択してください。");
      return;
    }

    setErrorMessage(null);
    setPlainText("");
    setGraphPreview(null);
    setOcrMetadata(undefined);
    setOcrProgress(null);
    setOcrRegions([DEFAULT_OCR_REGION]);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep("trim");

    if (!sessionName) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setSessionName(baseName.length > 0 ? baseName : "現地スキャン");
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    event.currentTarget.value = "";
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleCapture = (file: File) => {
    setSelectedImage(file);
  };

  const handleRunPipeline = async () => {
    if (!imageFile) {
      setErrorMessage("先に画像を選択してください");
      return;
    }

    if (ocrRegions.length === 0) {
      setErrorMessage("OCR する文字領域を指定してください");
      return;
    }

    setStep("processing");
    setErrorMessage(null);
    setIsRunningOcr(true);
    setIsRunningGraph(true);
    setPipelineStage("ocr");
    setPipelineProgress(3);
    setOcrProgress({ progress: 0, status: "loading tesseract core" });

    try {
      const ocrResult = await runOcrOnRegions(
        imageFile,
        ocrRegions,
        language,
        (update) => {
          setOcrProgress(update);
          if (update.status === "recognizing text") {
            setPipelineProgress(5 + Math.round(update.progress * 60));
          } else {
            setPipelineProgress(8);
          }
        },
      );
      setOcrMetadata(ocrResult.ocrMetadata);
      if (!ocrResult.plainText.trim()) {
        throw new Error("テキストを認識できませんでした。");
      }

      setPipelineStage("normalize");
      setPipelineProgress(72);
      setIsNormalizingText(true);
      const normalized = await normalizeOcrText.mutateAsync({
        plainText: ocrResult.plainText,
        language,
      });
      setIsNormalizingText(false);
      setPipelineProgress(86);

      const normalizedText = normalized.correctedText.trim();
      setPlainText(normalizedText);

      setPipelineStage("graph");
      setPipelineProgress(90);
      const graphResult = await extractGraphFromPlainText.mutateAsync({
        plainText: normalizedText,
      });
      const graph = graphResult.data?.graph;
      if (!graph) {
        throw new Error(graphResult.data?.error ?? "グラフ抽出に失敗しました");
      }

      setGraphPreview(graph as GraphDocumentForFrontend);
      setPipelineProgress(100);
      setStep("preview");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "処理に失敗しました",
      );
      setStep("trim");
    } finally {
      setIsRunningOcr(false);
      setIsNormalizingText(false);
      setIsRunningGraph(false);
      setOcrProgress(null);
      setPipelineStage(null);
      setTimeout(() => setPipelineProgress(0), 150);
    }
  };

  const handleReExtractGraph = async () => {
    const inputText = plainText.trim();
    if (!inputText) {
      setErrorMessage("再抽出するテキストが空です");
      return;
    }
    setErrorMessage(null);
    setIsRunningGraph(true);
    setPipelineStage("graph");
    setPipelineProgress(90);
    try {
      const graphResult = await extractGraphFromPlainText.mutateAsync({
        plainText: inputText,
      });
      const graph = graphResult.data?.graph;
      if (!graph) {
        throw new Error(graphResult.data?.error ?? "グラフ再抽出に失敗しました");
      }
      setGraphPreview(graph as GraphDocumentForFrontend);
      setPipelineProgress(100);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "グラフ再抽出に失敗しました",
      );
    } finally {
      setIsRunningGraph(false);
      setPipelineStage(null);
      setTimeout(() => setPipelineProgress(0), 150);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const trimmedPlainText = plainText.trim();
      const textBlob = new Blob([trimmedPlainText], {
        type: "text/plain;charset=utf-8",
      });
      const sourceTextUrl = await storageUtils.uploadFromBlob(
        textBlob,
        BUCKETS.PATH_TO_INPUT_TXT,
      );
      if (!sourceTextUrl) {
        throw new Error("OCR テキストのアップロードに失敗しました");
      }

      let sourceImageUrl: string | undefined;
      if (imageFile) {
        const uploadedUrl = await storageUtils.upload(
          imageFile,
          BUCKETS.PATH_TO_INPUT_SCAN,
        );
        if (!uploadedUrl) {
          throw new Error("スキャン画像のアップロードに失敗しました");
        }
        sourceImageUrl = uploadedUrl;
      }

      await createFromScan.mutateAsync({
        name: sessionName.trim(),
        plainText: trimmedPlainText,
        graphDocument: graphPreview ?? undefined,
        sourceTextUrl,
        sourceImageUrl,
        ocrMetadata,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "グラフ作成に失敗しました",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToCamera = () => {
    setStep("camera");
    setGraphPreview(null);
    setPlainText("");
    setErrorMessage(null);
  };

  const handleCancelRegionAdjust = () => {
    if (graphPreview) {
      setStep("preview");
      return;
    }
    setStep("camera");
  };

  if (!session) {
    return (
      <FadeIn>
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
          <p className="text-center text-sm text-slate-300">
            スキャンを保存するにはログインが必要です。
          </p>
          <Button
            onClick={() => signIn("google", { callbackUrl: "/field/scan" })}
            className="w-full bg-orange-400 text-white hover:bg-orange-500"
          >
            Google でログイン
          </Button>
        </div>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6 pb-24">
        <div className="flex items-start justify-start gap-3">
          <LinkButton
            href="/field"
            className="flex !h-8 !w-8 shrink-0 items-center justify-center"
          >
            <div className="h-4 w-4">
              <ChevronLeftIcon width={16} height={16} color="white" />
            </div>
          </LinkButton>
          <div>
            <h1 className="text-xl font-bold text-slate-50">新規スキャン</h1>
            <p className="text-sm text-slate-400">
              撮影 → 領域指定 → OCR → AI整形 → グラフプレビュー
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          onChange={handleImageChange}
          className="hidden"
        />

        {step === "camera" && (
          <LiveCameraScanner
            onCapture={handleCapture}
            onOpenFilePicker={handleOpenFilePicker}
          />
        )}

        {previewUrl && (step === "trim" || step === "processing") && (
          <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <label className="mb-2 block text-sm font-medium text-slate-200">
              2. 文字領域を指定
            </label>
            <ScanRegionSelector
              imageUrl={previewUrl}
              regions={ocrRegions}
              onRegionsChange={setOcrRegions}
              defaultFullscreen
              requireFullscreenChangeToComplete={graphPreview != null}
              onCancelFullscreen={handleCancelRegionAdjust}
            />
            <div className="mt-3 flex gap-2">
              <Button
                onClick={handleBackToCamera}
                className="w-1/2 bg-slate-700 text-white"
                disabled={step === "processing"}
              >
                撮り直す
              </Button>
              <Button
                onClick={handleRunPipeline}
                disabled={
                  !imageFile ||
                  step === "processing" ||
                  isRunningOcr ||
                  ocrRegions.length === 0
                }
                isLoading={step === "processing" || isRunningOcr}
                className="w-1/2 bg-orange-400 text-white hover:bg-orange-500"
              >
                この範囲で解析
              </Button>
            </div>
          </section>
        )}

        {(step === "trim" || step === "processing") && (
          <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <label className="mb-2 block text-sm font-medium text-slate-200">
              3. OCR 言語
            </label>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as OcrLanguage)
              }
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {isPipelineRunning && pipelineStage && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-slate-400">
                  {pipelineLabel}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full bg-orange-400 transition-all"
                    style={{
                      width: `${pipelineProgress}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {step === "preview" && graphPreview && (
          <>
            <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <label
                htmlFor="session-name"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                4. セッション名
              </label>
              <input
                id="session-name"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="例: 展覧会パンフレット p.3"
                className="mb-4 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />

              <label
                htmlFor="ocr-text"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                5. OCR テキスト（AI整形済み）
              </label>
              <textarea
                id="ocr-text"
                value={plainText}
                onChange={(event) => setPlainText(event.target.value)}
                rows={8}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />

              {isPipelineRunning && pipelineStage && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-slate-400">
                    {pipelineLabel}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full bg-orange-400 transition-all"
                      style={{ width: `${pipelineProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => setStep("trim")}
                  className="w-1/3 bg-slate-700 text-white"
                >
                  領域を再調整
                </Button>
                <Button
                  onClick={() => void handleReExtractGraph()}
                  isLoading={isRunningGraph}
                  disabled={!plainText.trim() || isRunningGraph}
                  className="w-1/3 bg-slate-700 text-white"
                >
                  再抽出して更新
                </Button>
                <Button
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit || isSubmitting}
                  isLoading={isSubmitting}
                  className="w-1/3 bg-orange-400 text-white hover:bg-orange-500 disabled:opacity-50"
                >
                  保存して詳細へ
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">
                6. グラフプレビュー
              </h2>
              <GraphPreview graphData={graphPreview} />
              <div className="mt-4">
                <GraphSummary
                  graph={graphPreview}
                  matchCandidates={previewMatchCandidates}
                />
              </div>
            </section>
          </>
        )}

        {errorMessage && (
          <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}
      </div>
    </FadeIn>
  );
}
