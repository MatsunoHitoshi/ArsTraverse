"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/app/_hooks/use-theme";
import { SunIcon, MoonIcon, DesktopIcon } from "../icons/icons";

export const ThemeToggle = () => {
  const { theme, changeTheme, mounted } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // マウント前は何も表示しない（SSR対応）
  if (!mounted) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md">
        <div className="h-5 w-5 animate-pulse rounded bg-gray-300 dark:bg-gray-600" />
      </div>
    );
  }

  const getCurrentIcon = () => {
    switch (theme) {
      case "light":
        return <SunIcon width={18} height={18} />;
      case "dark":
        return <MoonIcon width={18} height={18} />;
      case "system":
        return <DesktopIcon width={18} height={18} />;
      default:
        return <DesktopIcon width={18} height={18} />;
    }
  };

  const getCurrentLabel = () => {
    switch (theme) {
      case "light":
        return "ライト";
      case "dark":
        return "ダーク";
      case "system":
        return "システム";
      default:
        return "システム";
    }
  };

  const themeOptions = [
    {
      value: "light",
      label: "ライト",
      icon: <SunIcon width={16} height={16} />,
    },
    {
      value: "dark",
      label: "ダーク",
      icon: <MoonIcon width={16} height={16} />,
    },
    {
      value: "system",
      label: "システム",
      icon: <DesktopIcon width={16} height={16} />,
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-slate-50/10 dark:hover:bg-slate-50/10"
        aria-label={`テーマを変更 (現在: ${getCurrentLabel()})`}
      >
        {getCurrentIcon()}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-32 rounded-md border bg-white shadow-lg dark:border-slate-400 dark:bg-slate-900">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                changeTheme(option.value as "light" | "dark" | "system");
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-800 ${
                theme === option.value
                  ? "bg-gray-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
