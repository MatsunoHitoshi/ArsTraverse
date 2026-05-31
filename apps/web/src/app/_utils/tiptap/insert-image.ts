import { getBase64ListFromUrl } from "../image/image";
import { BUCKETS } from "../supabase/const";
import { storageUtils } from "../supabase/supabase";
import type { Editor } from "@tiptap/core";

const getImageStoragePath = async (path: string) => {
  if (!path) {
    return "";
  }
  const base64Image = await getBase64ListFromUrl([path]);
  if (!base64Image?.length) {
    return "";
  }
  const pathSupabase = await storageUtils.uploadFromDataURL(
    base64Image[0]!,
    BUCKETS.PATH_TO_RICH_TEXT_IMAGES,
  );
  return pathSupabase;
};

export const insertImageNode = (
  file: File,
  position: number,
  editor: Editor,
  setIsImageInsert: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (file && file.size > 10 * 1000 * 1000) {
      console.log("image size exceeded");
      alert("画像サイズは10.0MB以内にしてください。");
      reject(new Error("画像サイズが10.0MBを超えています"));
      return;
    }
    const fileReader = new FileReader();
    fileReader.readAsDataURL(file);
    fileReader.onload = async () => {
      try {
        if (fileReader.result && typeof fileReader.result === "string") {
          const fileReaderResult = fileReader.result;
          editor.commands.insertContent({ type: "paragraph" });
          editor
            .chain()
            .insertContentAt(
              position,
              '<p><span style="color: #545476" class="text-v2-semantic-text-place-holder">読み込み中…</span></p>',
            )
            .focus()
            .run();

          const imageURL = await getImageStoragePath(fileReaderResult);
          editor.commands.deleteNode("paragraph");
          editor.commands.setImage({
            src: imageURL,
          });

          setIsImageInsert(true);
          resolve();
        } else {
          reject(new Error("ファイルの読み込みに失敗しました"));
        }
      } catch (error) {
        reject(error);
      }
    };
    fileReader.onerror = () => {
      reject(new Error("ファイルの読み込み中にエラーが発生しました"));
    };
  });
};
