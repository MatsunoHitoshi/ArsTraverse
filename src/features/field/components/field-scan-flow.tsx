"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
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

export function FieldScanFlow() {
  const router = useRouter();
  const { data: session } = useSession();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [plainText, setPlainText] = useState("");
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createFromScan = api.scan.createFromScan.useMutation({
    onSuccess: (result) => {
      router.push(`/field/scan/${result.sourceDocument.id}`);
    },
    onError: (error) => {
      setErrorMessage(error.message ?? "グラフ作成に失敗しました");
    },
  });

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
      ocrRegions.length > 0,
    [sessionName, plainText, ocrRegions.length],
  );

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("画像ファイルを選択してください。");
      return;
    }

    setErrorMessage(null);
    setPlainText("");
    setOcrMetadata(undefined);
    setOcrProgress(null);
    setOcrRegions([DEFAULT_OCR_REGION]);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);

    if (!sessionName) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setSessionName(baseName.length > 0 ? baseName : "現地スキャン");
    }
  };

  const handleRunOcr = async () => {
    if (!imageFile) {
      setErrorMessage("先に画像を選択してください");
      return;
    }

    if (ocrRegions.length === 0) {
      setErrorMessage("OCR する文字領域を指定してください");
      return;
    }

    setIsRunningOcr(true);
    setErrorMessage(null);
    setOcrProgress({ progress: 0, status: "loading tesseract core" });

    try {
      const result = await runOcrOnRegions(
        imageFile,
        ocrRegions,
        language,
        setOcrProgress,
      );
      setPlainText(result.plainText);
      setOcrMetadata(result.ocrMetadata);
      if (!result.plainText) {
        setErrorMessage(
          "テキストを認識できませんでした。領域や言語設定を見直してください。",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "OCR に失敗しました",
      );
    } finally {
      setIsRunningOcr(false);
      setOcrProgress(null);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
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
        plainText: plainText.trim(),
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-50">新規スキャン</h1>
            <p className="text-sm text-slate-400">
              資料を撮影し、文字領域を指定 → OCR → グラフ化
            </p>
          </div>
          <Link href="/field" className="text-sm text-sky-400 hover:underline">
            一覧
          </Link>
        </div>

        <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-200">
            1. 画像を選択
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            onChange={handleImageChange}
            className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100"
          />
          {fileName && (
            <p className="mt-2 text-xs text-slate-400">選択中: {fileName}</p>
          )}
        </section>

        {previewUrl && (
          <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <label className="mb-2 block text-sm font-medium text-slate-200">
              2. 文字領域を指定
            </label>
            <ScanRegionSelector
              imageUrl={previewUrl}
              regions={ocrRegions}
              onRegionsChange={setOcrRegions}
            />
          </section>
        )}

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

          <div className="mt-3">
            <Button
              onClick={handleRunOcr}
              disabled={!imageFile || isRunningOcr || ocrRegions.length === 0}
              isLoading={isRunningOcr}
              className="w-full bg-slate-700 text-white"
            >
              選択領域で OCR を実行
            </Button>
          </div>

          {ocrProgress && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-400">
                {getOcrStatusLabel(ocrProgress)}
                {ocrProgress.status === "recognizing text"
                  ? ` ${Math.round(ocrProgress.progress * 100)}%`
                  : null}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full bg-orange-400 transition-all"
                  style={{
                    width: `${Math.round(
                      Math.max(
                        ocrProgress.progress * 100,
                        ocrProgress.status === "recognizing text" ? 0 : 8,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

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
            5. OCR テキスト（編集可）
          </label>
          <textarea
            id="ocr-text"
            value={plainText}
            onChange={(event) => setPlainText(event.target.value)}
            rows={8}
            placeholder="OCR 結果がここに表示されます。必要に応じて修正してください。"
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </section>

        {errorMessage && (
          <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <Button
          onClick={() => void handleSubmit()}
          disabled={!canSubmit || isSubmitting}
          isLoading={isSubmitting}
          className="w-full bg-orange-400 text-white hover:bg-orange-500 disabled:opacity-50"
        >
          グラフを作成
        </Button>
      </div>
    </FadeIn>
  );
}
