import type { LegacyRef } from "react";
import { Button } from "../button/button";
import { DropFileProviderDashed } from "../drop-file/drop-file-provider";
type FileUploaderProps = {
  name: string;
  inputRef: LegacyRef<HTMLInputElement>;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  file: File | null;
};

export const FileUploader = ({
  name,
  inputRef,
  setFile,
  file,
}: FileUploaderProps) => {
  return (
    <DropFileProviderDashed setFile={setFile}>
      <div className="flex min-h-[130px] w-full flex-col items-center">
        <input
          type="file"
          id="file-upload"
          name={name}
          accept="application/pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          ref={inputRef}
        />
        <div className="flex flex-col items-center gap-1">
          <div>ファイルをドラッグアンドドロップ</div>
          <div className="text-sm">または</div>
          <Button
            id="fileSelect"
            className="pointer-events-auto"
            onClick={() => {
              if (typeof window !== "undefined") {
                const fileElem = document.getElementById("file-upload");
                fileElem?.click();
              }
            }}
          >
            ファイルをアップロード
          </Button>
          <div className="text-xs">ファイルサイズ上限：50MB</div>
        </div>

        <div className="font-semibold">{file?.name}</div>
      </div>
    </DropFileProviderDashed>
  );
};
