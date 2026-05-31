import { DocumentType } from "@prisma/client";
import { writeLocalFileFromUrl } from "../sys/file";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

export const getTextFromDocumentFile = async (
  url: string,
  type: DocumentType,
) => {
  if (type === DocumentType.INPUT_PDF) {
    const localFilePath = await writeLocalFileFromUrl(url, "input.pdf");
    const loader = new PDFLoader(localFilePath);
    const documents = await loader.load();
    return documents.map((doc) => doc.pageContent).join("\n");
  } else {
    return await fetch(url).then((res) => res.text());
  }
};
