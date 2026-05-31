import fs from "fs";
import { env } from "@/env";
import { fileTypeFromBuffer } from "file-type";

export const writeFile = (base64: string, name: string) => {
  const path = `${env.TMP_DIRECTORY}/${new Date().getTime()}_${name}`;
  const bin = atob(base64.replace(/^.*,/, ""));
  const buffer = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    buffer[i] = bin.charCodeAt(i);
  }

  try {
    fs.writeFileSync(path, Buffer.from(buffer));
    return path;
  } catch (e) {
    console.log("failed to write file");
    return "";
  }
};

export const exportJson = (jsonString: string, name: string) => {
  const path = `./public/json/${new Date().getTime()}_${name}`;
  fs.writeFileSync(path, jsonString);
};

export const writeLocalFileFromUrl = async (url: string, fileName: string) => {
  const response = await fetch(url);
  const fileBuffer = await response.arrayBuffer();
  const localFilePath = writeFile(
    Buffer.from(fileBuffer).toString("base64"),
    fileName,
  );
  return localFilePath;
};

export type DocFileType = "pdf" | "docx" | "doc" | "txt" | undefined;

export const inspectFileTypeFromUrl = async (
  url: string,
): Promise<DocFileType> => {
  console.log(url);
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const fileTypeResult = await fileTypeFromBuffer(buffer);
  console.log(fileTypeResult);

  if (fileTypeResult) {
    if (fileTypeResult.ext === "pdf") {
      return "pdf";
    } else if (fileTypeResult.ext === "docx") {
      return "docx";
    } else if (fileTypeResult.ext === "doc") {
      return "doc";
    } else if (fileTypeResult.ext === "txt") {
      return "txt";
    }
  } else {
    return "txt";
  }
};
