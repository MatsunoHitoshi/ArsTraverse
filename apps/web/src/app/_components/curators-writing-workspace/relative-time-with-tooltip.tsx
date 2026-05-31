"use client";

import React, { useState } from "react";
import { formatDate, formatRelativeTime } from "@/app/_utils/date/format-date";

interface RelativeTimeWithTooltipProps {
  datetime: Date | string;
  className?: string;
}

export const RelativeTimeWithTooltip: React.FC<
  RelativeTimeWithTooltipProps
> = ({ datetime, className = "" }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      className={`relative cursor-default ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {formatRelativeTime(datetime)}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 transform rounded-md">
          <div className="rounded-md bg-black/50 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm">
            {formatDate(datetime)}
            <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 transform border-l-4 border-r-4 border-t-4 border-transparent border-t-black/50 backdrop-blur-sm"></div>
          </div>
        </div>
      )}
    </span>
  );
};
