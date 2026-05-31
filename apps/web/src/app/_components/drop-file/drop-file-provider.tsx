import React, { useState, type DragEvent } from "react";

type DropFileProviderProps = {
  children: React.ReactNode;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  multiple?: boolean;
  className?: string;
  dragOverClassName?: string;
  defaultClassName?: string;
};

export const DropFileProvider = ({
  children,
  setFile,
  className,
  defaultClassName,
  dragOverClassName,
  multiple = false,
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
    <div className={className}>
      <div
        className={`${defaultClassName} ${isDragActive && dragOverClassName}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      ></div>
      <div className="pointer-events-none z-10">{children}</div>
    </div>
  );
};

export const DropFileProviderDashed = ({
  children,
  setFile,
}: {
  children: React.ReactNode;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
}) => {
  return (
    <DropFileProvider
      setFile={setFile}
      className="relative flex h-full w-full flex-col items-center rounded-md bg-slate-500"
      defaultClassName="rounded-md border-2 border-dashed absolute inset-0 z-0 border-slate-200"
      dragOverClassName="!z-20 !border-orange-500 !bg-slate-500/80"
    >
      <div className="p-8">{children}</div>
    </DropFileProvider>
  );
};
