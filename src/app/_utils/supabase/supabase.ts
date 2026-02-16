import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { createId } from "../cuid/cuid";

export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const storageUtils = {
  upload: async (file: File | Blob, bucket: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(createId(), file);
    if (error) throw error;
    const { data: uploaded } = supabase.storage
      .from(bucket)
      .getPublicUrl(data?.path ?? "");
    return uploaded.publicUrl;
  },

  /** 指定パスにファイルをアップロード。既存なら上書き（upsert）。 */
  uploadWithPath: async (
    file: File | Blob,
    bucket: string,
    path: string,
  ): Promise<string> => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });
    if (error) throw error;
    const pathUsed = data?.path ?? path;
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(pathUsed);
    return urlData.publicUrl;
  },

  /** 指定パスのファイルが存在するか確認。 */
  exists: async (bucket: string, path: string): Promise<boolean> => {
    const result = await supabase.storage.from(bucket).exists(path);
    return result.data === true;
  },

  /** 指定パスの公開 URL を取得（存在チェックは行わない）。 */
  getPublicUrl: (bucket: string, path: string): string => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  uploadFromDataURL: async (dataURL: string, bucket: string) => {
    const blob = await fetch(dataURL).then((r) => r.blob());
    return storageUtils.upload(blob, bucket);
  },
  uploadFromBlob: async (blob: Blob, bucket: string) => {
    return storageUtils.upload(blob, bucket);
  },

  cleaning: async (ids: string[], bucket: string, deleteKey: string) => {
    if (env.DELETE_KEY !== deleteKey) {
      throw new Error("Invalid delete key");
    } else {
      const files = await supabase.storage.from(bucket).list();
      const fileIds = files.data?.map((file) => file.name);
      console.log("fileIds: ", fileIds);
      console.log("fileIds-length: ", fileIds?.length);
      let res: string[] = [];
      if (fileIds) {
        for (const fileId of fileIds) {
          if (!ids.includes(fileId)) {
            const spRes = await supabase.storage.from(bucket).remove([fileId]);
            const removedIds = spRes.data?.map((file) => file.id) ?? [];
            res = [...res, ...removedIds];
            console.log("path: ", fileId);
          }
        }
      }
      console.log("res-length: ", res.length);
      return res;
    }
  },
};
