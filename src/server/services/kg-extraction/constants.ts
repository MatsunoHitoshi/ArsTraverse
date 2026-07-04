/** 1回の Cron 実行で処理するチャンク数 */
export const KG_EXTRACTION_BATCH_SIZE = 3;

/** このチャンク数以下はインライン抽出（即時完了） */
export const KG_EXTRACTION_INLINE_CHUNK_THRESHOLD = 10;
