import { FileTextIcon } from "../icons";

type FileUploadedProps = {
  fileName?: string;
};

export const FileUploaded = ({ fileName }: FileUploadedProps) => {
  return (
    <div className="flex min-h-[176px] w-full min-w-[176px] max-w-[200px] flex-row items-center justify-center rounded-xl border-2 border-dashed border-slate-900 bg-slate-300 p-4">
      <div className="flex flex-col items-center gap-1">
        <FileTextIcon height={60} width={60} />
        <div>{fileName}</div>
      </div>
    </div>
  );
};
