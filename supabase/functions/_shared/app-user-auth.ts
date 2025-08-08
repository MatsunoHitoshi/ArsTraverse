import { supabaseAdmin } from "./pg-client.ts";

export const appUserAuth = async (req: Request): Promise<string | null> => {
  // 認証ヘッダーからトークンを抽出
  const token = req.headers.get("User-Authorization");
  if (!token) {
    return null;
  }

  try {
    // サービスロールを使用してトークンを検証
    const { data: account, error } = await supabaseAdmin
      .from("Account")
      .select("id, userId")
      .eq("id_token", token);

    console.log("account:", account);

    if (error) {
      console.error("Auth error:", error);
      return null;
    }

    // ユーザーIDを取得
    return account[0].userId;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
};
