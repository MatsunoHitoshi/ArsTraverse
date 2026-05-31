"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";
import {
  readFileAsDataUrl,
  runOcr,
  type OcrLanguage,
} from "@/features/field/ocr/tesseract-client";

const LANGUAGE_OPTIONS: { value: OcrLanguage; label: string }[] = [
  { value: "jpn", label: "日本語（横書き）" },
  { value: "jpn_vert", label: "日本語（縦書き）" },
  { value: "eng", label: "English" },
];

export function FieldScanFlow() {
  const router = useRouter();
  const { data: session } = useSession();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [plainText, setPlainText] = useState("");
  const [language, setLanguage] = useState<OcrLanguage>("jpn");
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrMetadata, setOcrMetadata] = useState<
    Record<string, unknown> | undefined
  >();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunningOcr, setIsRunningOcr] = useState(false);

  const createFromScan = api.scan.createFromScan.useMutation({
    onSuccess: (result) => {
      router.push(`/field/scan/${result.sourceDocument.id}`);
    },
    onError: (error) => {
      setErrorMessage(error.message ?? "グラフ作成に失敗しました");
    },
  });

  const canSubmit = useMemo(
    () => sessionName.trim().length > 0 && plainText.trim().length > 0,
    [sessionName, plainText],
  );

  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setPlainText("");
    setOcrMetadata(undefined);
    setOcrProgress(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setFileName(file.name);
      if (!sessionName) {
        setSessionName(file.name.replace(/\.[^.]+$/, "") || "現地スキャン");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "画像の読み込みに失敗しました",
      );
    }
  };

  const handleRunOcr = async () => {
    if (!imageDataUrl) {
      setErrorMessage("先に画像を選択してください");
      return;
    }

    setIsRunningOcr(true);
    setErrorMessage(null);
    setOcrProgress(0);

    try {
      const result = await runOcr(imageDataUrl, language, setOcrProgress);
      setPlainText(result.plainText);
      setOcrMetadata(result.ocrMetadata);
      if (!result.plainText) {
        setErrorMessage(
          "テキストを認識できませんでした。言語設定を変えるか、画像を見直してください。",
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

  const handleSubmit = () => {
    if (!canSubmit) return;

    createFromScan.mutate({
      name: sessionName.trim(),
      plainText: plainText.trim(),
      imageDataUrl: imageDataUrl ?? undefined,
      ocrMetadata,
    });
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
              資料を撮影し、OCR → グラフ化 → 公開参照まで進めます
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
          {imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageDataUrl}
              alt="スキャンプレビュー"
              className="mt-3 max-h-64 w-full rounded-lg object-contain bg-slate-900"
            />
          )}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-200">
            2. OCR 言語
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
              disabled={!imageDataUrl || isRunningOcr}
              isLoading={isRunningOcr}
              className="w-full bg-slate-700 text-white"
            >
              OCR を実行
            </Button>
          </div>

          {ocrProgress !== null && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-400">
                認識中 {Math.round(ocrProgress * 100)}%
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full bg-orange-400 transition-all"
                  style={{ width: `${Math.round(ocrProgress * 100)}%` }}
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
            3. セッション名
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
            4. OCR テキスト（編集可）
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
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={createFromScan.isPending}
          className="w-full bg-orange-400 text-white hover:bg-orange-500 disabled:opacity-50"
        >
          グラフを作成
        </Button>
      </div>
    </FadeIn>
  );
}
