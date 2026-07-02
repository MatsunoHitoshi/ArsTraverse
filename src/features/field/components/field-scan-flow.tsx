"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "i18n/navigation";
import { useTranslations } from "next-intl";
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
import { OcrLanguageSelect } from "@/features/field/components/ocr-language-select";
import { ScanRegionSelector } from "@/features/field/components/scan-region-selector";
import { ScanImageWithRegions } from "@/features/field/components/scan-image-with-regions";
import { rotateImageFile90CounterClockwise } from "@/features/field/ocr/image-crop";
import {
  DEFAULT_OCR_REGION,
  areRegionsEqual,
  rotateRegion90CounterClockwise,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";
import { terminateNdlOcrWorker } from "@/features/field/ocr/ndlocr/ndlocr-client";
import {
  runOcrOnRegions,
  type OcrLanguage,
  type OcrProgressUpdate,
} from "@/features/field/ocr/ocr-runner";
import type { OcrMetadata } from "@/server/api/schemas/scan";

type ScanStep = "camera" | "trim" | "processing" | "preview";
type PipelineStage = "ocr" | "normalize" | "graph" | null;

function getLocalizedOcrStatusLabel(
  t: ReturnType<typeof useTranslations<"field">>,
  update: OcrProgressUpdate,
): string {
  const statusLabels: Record<string, string> = {
    "loading tesseract core": t("ocrStatusLoadingTesseractCore"),
    "initializing tesseract": t("ocrStatusInitializingTesseract"),
    "loading language traineddata": t("ocrStatusLoadingLanguage"),
    "initializing api": t("ocrStatusInitializingApi"),
    "recognizing text": t("ocrStatusRecognizingText"),
    ndlocr_preparing: t("ndlocrStatusPreparing"),
    ndlocr_initializing: t("ndlocrStatusInitializing"),
    ndlocr_loading_models: t("ndlocrStatusLoadingModels"),
    ndlocr_initializing_models: t("ndlocrStatusInitializingModels"),
    ndlocr_layout_detection: t("ndlocrStatusLayoutDetection"),
    ndlocr_text_recognition: t("ndlocrStatusTextRecognition"),
    ndlocr_reading_order: t("ndlocrStatusReadingOrder"),
    ndlocr_generating_output: t("ndlocrStatusGeneratingOutput"),
  };
  const base = statusLabels[update.status] ?? t("ocrStatusPreparing");
  if (update.regionIndex != null && update.regionCount != null) {
    return t("ocrStatusRegionProgress", {
      label: base,
      index: update.regionIndex + 1,
      total: update.regionCount,
    });
  }
  return base;
}

export function FieldScanFlow() {
  const t = useTranslations("field");
  const router = useRouter();
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    return () => {
      terminateNdlOcrWorker();
    };
  }, []);

  const [ocrMetadata, setOcrMetadata] = useState<OcrMetadata | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [isNormalizingText, setIsNormalizingText] = useState(false);
  const [isRunningGraph, setIsRunningGraph] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRotatingImage, setIsRotatingImage] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>(null);
  const [pipelineProgress, setPipelineProgress] = useState(0);

  const lastOcrRegions = ocrMetadata?.regions;
  const lastOcrLanguage = ocrMetadata?.language;
  const isOcrStale = useMemo(() => {
    if (!ocrMetadata) return false;

    const regionsChanged =
      lastOcrRegions == null ||
      !areRegionsEqual(ocrRegions, lastOcrRegions);
    const languageChanged =
      lastOcrLanguage != null && lastOcrLanguage !== language;

    return regionsChanged || languageChanged;
  }, [language, lastOcrLanguage, lastOcrRegions, ocrMetadata, ocrRegions]);

  const createFromScan = api.scan.createFromScan.useMutation();
  const normalizeOcrText = api.scan.normalizeOcrText.useMutation();
  const extractGraphFromPlainText = api.kg.extractKGFromPlainText.useMutation();
  const previewMatchNodeNames = useMemo(
    () =>
      (graphPreview?.nodes.map((node) => node.name).filter(Boolean) ?? []).slice(
        0,
        200,
      ),
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

  useEffect(() => {
    if (step !== "camera") {
      delete document.body.dataset.fieldCameraActive;
      document.body.style.overflow = "";
      return;
    }

    document.body.dataset.fieldCameraActive = "true";
    document.body.style.overflow = "hidden";

    return () => {
      delete document.body.dataset.fieldCameraActive;
      document.body.style.overflow = "";
    };
  }, [step]);

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
        ? `${getLocalizedOcrStatusLabel(t, ocrProgress)}${ocrProgress.status === "recognizing text" ||
          ocrProgress.status === "ndlocr_text_recognition" ||
          ocrProgress.status === "ndlocr_layout_detection"
          ? ` ${Math.round(ocrProgress.progress * 100)}%`
          : ""
        }`
        : t("runningOcr");
    }
    if (pipelineStage === "normalize") return t("normalizingText");
    if (pipelineStage === "graph") return t("extractingGraph");
    return "";
  }, [pipelineStage, ocrProgress, t]);

  const setSelectedImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMessage(t("selectImageFile"));
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
      setSessionName(baseName.length > 0 ? baseName : t("defaultSessionName"));
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

  const handleOpenNativeCamera = () => {
    nativeCameraInputRef.current?.click();
  };

  const handleCapture = (file: File) => {
    setSelectedImage(file);
  };

  const handleRotateImage = async () => {
    if (!imageFile || isRotatingImage) return;

    setIsRotatingImage(true);
    setErrorMessage(null);

    try {
      const mimeType = imageFile.type.startsWith("image/")
        ? imageFile.type
        : "image/jpeg";
      const rotated = await rotateImageFile90CounterClockwise(
        imageFile,
        mimeType,
      );

      setOcrRegions((prev) =>
        prev.map((region) => rotateRegion90CounterClockwise(region)),
      );

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setImageFile(rotated);
      setPreviewUrl(URL.createObjectURL(rotated));
      setPlainText("");
      setGraphPreview(null);
      setOcrMetadata(undefined);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("imageRotateFailed"),
      );
    } finally {
      setIsRotatingImage(false);
    }
  };

  const handleRunPipeline = async () => {
    if (!imageFile) {
      setErrorMessage(t("selectImageFirst"));
      return;
    }

    if (ocrRegions.length === 0) {
      setErrorMessage(t("specifyOcrRegion"));
      return;
    }

    setStep("processing");
    setErrorMessage(null);
    setIsRunningOcr(true);
    setIsRunningGraph(true);
    setPipelineStage("ocr");
    setPipelineProgress(3);
    setOcrProgress({ progress: 0, status: language === "jpn_vert" ? "ndlocr_preparing" : "loading tesseract core" });

    try {
      const ocrResult = await runOcrOnRegions(
        imageFile,
        ocrRegions,
        language,
        (update) => {
          setOcrProgress(update);
          if (update.status === "recognizing text" ||
            update.status === "ndlocr_text_recognition" ||
            update.status === "ndlocr_layout_detection") {
            setPipelineProgress(5 + Math.round(update.progress * 60));
          } else {
            setPipelineProgress(8);
          }
        },
      );
      setOcrMetadata(ocrResult.ocrMetadata);
      if (!ocrResult.plainText.trim()) {
        throw new Error(t("textNotRecognized"));
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
        throw new Error(graphResult.data?.error ?? t("graphExtractFailed"));
      }

      setGraphPreview(graph as GraphDocumentForFrontend);
      setPipelineProgress(100);
      setStep("preview");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("processingFailed"),
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
      setErrorMessage(t("reExtractTextEmpty"));
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
        throw new Error(graphResult.data?.error ?? t("graphReExtractFailed"));
      }
      setGraphPreview(graph as GraphDocumentForFrontend);
      setPipelineProgress(100);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("graphReExtractFailed"),
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
      const sourceTextUrl = await storageUtils.upload(
        textBlob,
        BUCKETS.PATH_TO_INPUT_TXT,
      );
      if (!sourceTextUrl) {
        throw new Error(t("ocrTextUploadFailed"));
      }

      let sourceImageUrl: string | undefined;
      if (imageFile) {
        const uploadedUrl = await storageUtils.upload(
          imageFile,
          BUCKETS.PATH_TO_INPUT_SCAN,
        );
        if (!uploadedUrl) {
          throw new Error(t("scanImageUploadFailed"));
        }
        sourceImageUrl = uploadedUrl;
      }

      const result = await createFromScan.mutateAsync({
        name: sessionName.trim(),
        plainText: trimmedPlainText,
        graphDocument: graphPreview ?? undefined,
        sourceTextUrl,
        sourceImageUrl,
        ocrMetadata,
      });

      router.push(`/field/scan/${result.sourceDocument.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("graphCreateFailed"),
      );
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
            {t("loginRequiredForScan")}
          </p>
          <Button
            onClick={() => signIn("google", { callbackUrl: "/field/scan" })}
            className="w-full bg-orange-400 text-white hover:bg-orange-500"
          >
            {t("signInWithGoogle")}
          </Button>
        </div>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleImageChange}
        className="hidden"
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageChange}
        className="hidden"
      />

      {step === "camera" && (
        <LiveCameraScanner
          onCapture={handleCapture}
          onOpenFilePicker={handleOpenFilePicker}
          onOpenNativeCamera={handleOpenNativeCamera}
          onBack={() => router.push("/field")}
        />
      )}

      {step !== "camera" && (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6 pb-24 pt-14">
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
              <h1 className="text-xl font-bold text-slate-50">{t("newScan")}</h1>
            </div>
          </div>

          {graphPreview && step === "trim" && (
            <div className="flex justify-end">
              <Button
                onClick={() => setStep("preview")}
                className="bg-slate-700 px-3 py-1.5 text-xs text-white"
                size="small"
              >
                {t("backToPreview")}
              </Button>
            </div>
          )}

          {previewUrl && (step === "trim" || step === "processing") && (
            <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-200">
                {t("selectTextRegion")}
              </label>
              <ScanRegionSelector
                imageUrl={previewUrl}
                regions={ocrRegions}
                onRegionsChange={setOcrRegions}
                defaultFullscreen
                requireFullscreenChangeToComplete={graphPreview != null}
                onCancelFullscreen={handleCancelRegionAdjust}
                onCompleteFullscreen={() => {
                  // Stay on trim so the user can re-run OCR after adjusting regions.
                }}
                onRotateImage={() => void handleRotateImage()}
                isRotatingImage={isRotatingImage}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={handleBackToCamera}
                  className="w-1/2 bg-slate-700 text-white"
                  disabled={step === "processing"}
                >
                  {t("retake")}
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
                  {graphPreview
                    ? t("analyzeThisRegionAgain")
                    : t("analyzeThisRegion")}
                </Button>
              </div>
              {graphPreview && (
                <p className="mt-2 text-xs text-slate-500">
                  {t("regionRerunHint")}
                </p>
              )}
            </section>
          )}

          {(step === "trim" || step === "processing") && (
            <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <label
                htmlFor="ocr-language-trim"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                {t("ocrLanguage")}
              </label>
              <OcrLanguageSelect
                id="ocr-language-trim"
                value={language}
                onChange={setLanguage}
                disabled={step === "processing" || isPipelineRunning}
              />
              {language === "jpn_vert" && (
                <p className="mt-2 text-xs text-slate-500">
                  {t("ndlocrFirstRunHint")}
                </p>
              )}

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
              {previewUrl && (
                <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    {t("selectedTextRegion")}
                  </label>
                  <ScanImageWithRegions
                    imageUrl={previewUrl}
                    regions={ocrRegions}
                    alt={t("selectedTextRegion")}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {t("regionAdjustHint")}
                  </p>
                  {isOcrStale && (
                    <p className="mt-2 rounded-md border border-orange-400/60 bg-orange-400/15 px-2 py-1.5 text-xs font-medium text-orange-300">
                      {t("ocrStaleHint")}
                    </p>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                <label
                  htmlFor="ocr-language-preview"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  {t("ocrLanguage")}
                </label>
                <OcrLanguageSelect
                  id="ocr-language-preview"
                  value={language}
                  onChange={setLanguage}
                  disabled={isPipelineRunning}
                />
                {language === "jpn_vert" && (
                  <p className="mt-2 text-xs text-slate-500">
                    {t("ndlocrFirstRunHint")}
                  </p>
                )}
                {isOcrStale && (
                  <p className="mt-2 rounded-md border border-orange-400/60 bg-orange-400/15 px-2 py-1.5 text-xs font-medium text-orange-300">
                    {t("ocrStaleHint")}
                  </p>
                )}

                <label
                  htmlFor="session-name"
                  className="mb-2 mt-4 block text-sm font-medium text-slate-200"
                >
                  {t("sessionName")}
                </label>
                <input
                  id="session-name"
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                  placeholder={t("sessionNamePlaceholder")}
                  className="mb-4 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />

                <label
                  htmlFor="ocr-text"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  {t("ocrTextNormalized")}
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

                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setStep("trim")}
                      className="w-1/2 bg-slate-700 text-white"
                      disabled={isPipelineRunning}
                    >
                      {t("readjustRegion")}
                    </Button>
                    <Button
                      onClick={() => void handleRunPipeline()}
                      isLoading={isRunningOcr}
                      disabled={
                        !imageFile ||
                        isPipelineRunning ||
                        ocrRegions.length === 0
                      }
                      className="w-1/2 bg-orange-400 text-white hover:bg-orange-500"
                    >
                      {t("rerunOcrAndUpdate")}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void handleReExtractGraph()}
                      isLoading={isRunningGraph && pipelineStage === "graph"}
                      disabled={
                        !plainText.trim() ||
                        isPipelineRunning
                      }
                      className="w-1/2 bg-slate-700 text-white"
                    >
                      {t("reExtractGraphFromText")}
                    </Button>
                    <Button
                      onClick={() => void handleSubmit()}
                      disabled={!canSubmit || isSubmitting || isPipelineRunning}
                      isLoading={isSubmitting}
                      className="w-1/2 bg-orange-400 text-white hover:bg-orange-500 disabled:opacity-50"
                    >
                      {t("saveAndGoToDetail")}
                    </Button>
                  </div>
                </div>
              </section>



              <GraphPreview graphData={graphPreview} />

              <GraphSummary
                graph={graphPreview}
                matchCandidates={previewMatchCandidates}
                onGraphChange={setGraphPreview}
              />

            </>
          )}

          {errorMessage && (
            <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </FadeIn>
  );
}
