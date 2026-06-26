# Google Drive 同期（TopicSpace）

ArsTraverse が TopicSpace 単位で Google Drive フォルダと同期し、`INPUT_DRIVE` 型の SourceDocument として知識グラフ化します。

## 認証方式

ログイン中の **本人の Google アカウント** で Drive にアクセスします（ユーザー OAuth のみ）。

1. TopicSpace 画面で **「Google Drive を連携」**（`/api/google-drive/connect`）
2. Google の同意画面で Drive 読み取りを許可
3. **「フォルダを選ぶ」**（Google Picker）で同期フォルダを選択
4. **「今すぐ同期」**

- フォルダ ID の手入力不要
- サービスアカウントへの共有不要
- `UserGoogleDriveConnection` に refresh token を保存
- Cron 同期は `configuredByUserId` の token を使用

## 環境変数

| 変数 | 説明 |
|------|------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 既存 NextAuth 用（Drive 追加 OAuth にも使用） |
| `NEXTAUTH_SECRET` | OAuth state 署名 |
| `NEXT_PUBLIC_BASE_URL` | OAuth コールバック URL のベース |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | Google Picker 用 API キー |
| `NEXT_PUBLIC_GOOGLE_APP_ID` | Google Cloud プロジェクト番号 |

## Google Cloud Console 設定

1. **Drive API** を有効化
2. OAuth クライアントの **承認済みリダイレクト URI** に追加:
   - `https://<your-domain>/api/google-drive/callback`
   - ローカル: `http://localhost:3000/api/google-drive/callback`
3. OAuth 同意画面にスコープ `https://www.googleapis.com/auth/drive.readonly` を追加
4. Picker 用に **API キー** を作成（HTTP リファラー制限推奨）

## データモデル

- `UserGoogleDriveConnection` — ユーザーごとの Drive refresh token
- `TopicSpaceDriveSync.configuredByUserId` — OAuth 同期のトークン持ち主
- `TopicSpaceDriveSync.driveFolderName` — Picker で選んだ表示名

## MCP / CLI

| 手段 | 説明 |
|------|------|
| `sync_topic_space_drive_folder` | Platform MCP で Drive 同期 |
| `get_topic_space_drive_sync_status` | 同期設定・状態の確認 |
| `npm run export:topic-space` | DB からグラフ JSON をエクスポート |

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| Picker が開かない | `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` / `NEXT_PUBLIC_GOOGLE_APP_ID` を確認 |
| 同期で token エラー | Drive 連携を解除して再連携 |
| Cron が止まる | 設定者の token 失効 → 再連携 |
