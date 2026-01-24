"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/app/_components/button/button";
import type { PrintLayoutSettings } from "./types";
import { convertUnit, PAGE_SIZE_TEMPLATES } from "./types";

interface PdfExportButtonProps {
  layoutSettings: PrintLayoutSettings;
  workspaceId: string;
}

export function PdfExportButton({ layoutSettings, workspaceId }: PdfExportButtonProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    // 動的に@pageルールを生成して追加
    const style = document.createElement("style");
    style.id = "print-page-size-style";

    // ページサイズをmm単位で取得
    let pageWidth: number;
    let pageHeight: number;

    if (layoutSettings.pageSize.mode === "template" && layoutSettings.pageSize.template) {
      const template = PAGE_SIZE_TEMPLATES[layoutSettings.pageSize.template];
      const isLandscape = layoutSettings.pageSize.orientation === "landscape";
      pageWidth = isLandscape ? template.height : template.width;
      pageHeight = isLandscape ? template.width : template.height;
    } else {
      const unit = layoutSettings.pageSize.unit ?? "mm";
      const width = layoutSettings.pageSize.customWidth ?? 1116;
      const height = layoutSettings.pageSize.customHeight ?? 800;
      pageWidth = convertUnit(width, unit, "mm");
      pageHeight = convertUnit(height, unit, "mm");
    }

    // @pageルールを生成
    const pageRule = `
      @page {
        size: ${pageWidth}mm ${pageHeight}mm;
        margin: ${layoutSettings.margins.top}mm ${layoutSettings.margins.right}mm ${layoutSettings.margins.bottom}mm ${layoutSettings.margins.left}mm;
      }
    `;

    style.textContent = pageRule;
    document.head.appendChild(style);
    styleRef.current = style;

    return () => {
      // クリーンアップ
      if (styleRef.current?.parentNode) {
        styleRef.current.parentNode.removeChild(styleRef.current);
      }
    };
  }, [layoutSettings]);

  const handlePrint = () => {
    // カスタムサイズの場合はユーザーに案内を表示
    if (layoutSettings.pageSize.mode === "custom") {
      const unit = layoutSettings.pageSize.unit ?? "mm";
      const width = layoutSettings.pageSize.customWidth ?? 1116;
      const height = layoutSettings.pageSize.customHeight ?? 800;
      const widthMm = convertUnit(width, unit, "mm");
      const heightMm = convertUnit(height, unit, "mm");

      const message = `カスタムサイズ（${widthMm.toFixed(1)}mm × ${heightMm.toFixed(1)}mm）で印刷します。\n\n印刷ダイアログで「用紙サイズ」を「カスタム」に設定してください。`;
      if (window.confirm(message)) {
        window.print();
      }
    } else {
      window.print();
    }
  };

  return (
    <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
      PDF出力
    </Button>
  );
}
