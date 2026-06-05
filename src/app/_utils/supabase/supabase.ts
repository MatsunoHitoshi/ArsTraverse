import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { createId } from "../cuid/cuid";

export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function resolveUploadContentType(file: File | Blob): string | undefined {
  return file.type || undefined;
}

export const storageUtils = {
  upload: async (file: File | Blob, bucket: string) => {
    const objectKey = createId();
    const contentType = resolveUploadContentType(file);
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(objectKey, file, contentType ? { contentType } : undefined);

    if (error ?? !data?.path) {
      console.error("[storageUtils.upload] failed", {
        bucket,
        objectKey,
        error: error?.message,
      });
      return null;
    }

    const { data: uploaded } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);
    return uploaded.publicUrl || null;
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
