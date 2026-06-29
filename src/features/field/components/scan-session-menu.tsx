"use client";

import { useTranslations } from "next-intl";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { DocumentListMenuButton } from "@/app/_components/list/document-list";
import { DotHorizontalIcon, Pencil2Icon, TrashIcon } from "@/app/_components/icons";

type ScanSessionMenuProps = {
  onRename: () => void;
  onDelete: () => void;
  ariaLabel?: string;
  className?: string;
};

export function ScanSessionMenu({
  onRename,
  onDelete,
  ariaLabel,
  className = "",
}: ScanSessionMenuProps) {
  const t = useTranslations("field");
  const tCommon = useTranslations("common");

  return (
    <Popover className={`relative z-10 ${className}`}>
      <PopoverButton
        className="!h-8 !w-8 rounded-md bg-slate-600/90 !p-2 hover:bg-slate-600"
        aria-label={ariaLabel ?? t("scanMenuAriaLabel")}
      >
        <DotHorizontalIcon height={16} width={16} color="white" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom end"
        className="flex min-w-[150px] flex-col rounded-md bg-black/20 py-2 text-slate-50 backdrop-blur-2xl"
      >
        <DocumentListMenuButton
          icon={<Pencil2Icon width={16} height={16} color="white" />}
          onClick={onRename}
        >
          <div className="text-white">{t("rename")}</div>
        </DocumentListMenuButton>
        <DocumentListMenuButton
          icon={<TrashIcon width={16} height={16} color="#ea1c0c" />}
          onClick={onDelete}
        >
          <div className="text-error-red">{tCommon("delete")}</div>
        </DocumentListMenuButton>
      </PopoverPanel>
    </Popover>
  );
}
