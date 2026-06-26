import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "../button/button";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) => {
  const t = useTranslations("pagination");

  return (
    <div
      className={`flex flex-row items-center justify-center gap-4 ${className ?? ""}`}
    >
      <Button
        className="!w-max !px-3 !py-1 text-xs"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        {t("previous")}
      </Button>
      <div className="text-sm">
        {currentPage} / {totalPages}
      </div>
      <Button
        className="!w-max !px-3 !py-1 text-xs"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
      >
        {t("next")}
      </Button>
    </div>
  );
};
