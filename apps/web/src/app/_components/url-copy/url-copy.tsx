"use client";

import { useState } from "react";
import { Button } from "../button/button";

export const UrlCopy = ({
  className,
  children,
  messagePosition = "bottom",
  url,
}: {
  className?: string;
  children: React.ReactNode;
  messagePosition?: "bottom" | "inButton";
  url?: string;
}) => {
  const isBrowser = typeof window !== "undefined";

  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const urlCopyHandler = async (url: string) => {
    if (!isBrowser) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage("OK");
    } catch {
      setCopyMessage("!!");
    }
    setTimeout(() => {
      setCopyMessage(null);
    }, 2000);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        className={className}
        onClick={() => urlCopyHandler(url ?? location.href)}
      >
        {copyMessage && messagePosition === "inButton" ? (
          <div className="text-sm text-slate-50">{copyMessage}</div>
        ) : (
          <>{children}</>
        )}
      </Button>
      {copyMessage && messagePosition === "bottom" ? (
        <div className="text-sm">{copyMessage}</div>
      ) : (
        <></>
      )}
    </div>
  );
};
