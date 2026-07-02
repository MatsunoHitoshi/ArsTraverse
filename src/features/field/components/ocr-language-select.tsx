"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { OcrLanguage } from "@/features/field/ocr/ocr-types";

type OcrLanguageSelectProps = {
  value: OcrLanguage;
  onChange: (language: OcrLanguage) => void;
  disabled?: boolean;
  id?: string;
};

export function OcrLanguageSelect({
  value,
  onChange,
  disabled = false,
  id,
}: OcrLanguageSelectProps) {
  const t = useTranslations("field");

  const languageOptions = useMemo(
    (): { value: OcrLanguage; label: string }[] => [
      { value: "jpn", label: t("languageJpn") },
      { value: "jpn_vert", label: t("languageJpnVert") },
      { value: "eng", label: t("languageEng") },
    ],
    [t],
  );

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as OcrLanguage)}
      disabled={disabled}
      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
    >
      {languageOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
