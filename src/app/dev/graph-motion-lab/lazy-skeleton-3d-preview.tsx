"use client";

import dynamic from "next/dynamic";

export const SkeletonMotion3DPreview = dynamic(
  () =>
    import("./skeleton-motion-3d-preview").then((mod) => ({
      default: mod.SkeletonMotion3DPreview,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] w-[280px] items-center justify-center rounded-lg border border-gray-700 bg-slate-950 text-xs text-gray-500">
        3D preview loading…
      </div>
    ),
  },
);
