/**
 * ドラフト upsert 時の properties 解決。
 * - `undefined` … 既存値を保持（未指定扱い）
 * - `{}` などオブジェクト … 明示的な上書き（空ならクリア）
 */
export function resolveDraftEntityProperties(
  existingProperties: Record<string, string> | undefined,
  inputProperties: Record<string, string | number | boolean | null> | undefined,
): Record<string, string> {
  if (inputProperties !== undefined) {
    return Object.fromEntries(
      Object.entries(inputProperties).map(([k, v]) => [k, String(v)]),
    );
  }
  return existingProperties ?? {};
}
