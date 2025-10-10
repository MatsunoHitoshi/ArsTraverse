import React, { useState, type DragEvent } from "react";

type DropFileProviderProps = {
  children: React.ReactNode;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  multiple?: boolean;
};

export const DropFileProvider = ({
  children,
  setFile,
}: DropFileProviderProps) => {
  const [isDragActive, setIsDragActive] = useState<boolean>(false);

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  };

  const onDragLeave = (_e: DragEvent<HTMLDivElement>) => {
    setIsDragActive(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const fieldFiles = Array.from(e.dataTransfer.files);
    if (fieldFiles !== null && fieldFiles.length > 0) {
      if (fieldFiles?.[0]) {
        setFile(fieldFiles?.[0]);
      }
      e.dataTransfer.clearData();
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center rounded-md bg-slate-500">
      <div
        className={`rounded-md border-2 border-dashed ${isDragActive ? "z-20 border-orange-500 bg-slate-500/80" : "z-0 border-slate-200"} absolute inset-0 `}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      ></div>
      <div className="pointer-events-none z-10 p-8">{children}</div>
    </div>
  );
};
