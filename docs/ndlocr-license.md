# NDLOCR / NDLOCR-Lite ライセンスと帰属表示

ArsTraverse では縦書き日本語 OCR に **NDLOCR-Lite** 系の ONNX モデルと推論コードを利用している。本ドキュメントは利用上のライセンス制約と、開発・運用時に守るべき帰属表示をまとめる。

> About ページでは OCR 機能に言及していないため、現時点では About への掲載は不要とする。公開サービスで OCR を説明する UI を追加した際に、ユーザー向けクレジットも検討する。

## 利用箇所

| 経路 | 説明 | 主なコード |
|------|------|-----------|
| フィールドスキャン（ブラウザ） | 縦書き（`jpn_vert`）選択時 | `src/features/field/ocr/ndlocr/` |
| PDF / Drive 同期（サーバー） | 縦書き判定時のバッチ OCR | `src/server/lib/ndlocr-server/` |

いずれも [ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web) をベースに移植・再実装したもので、レイアウト検出・文字認識の元は国立国会図書館（NDL）の [NDLOCR-Lite](https://github.com/ndl-lab/ndlocr-lite) である。

横書き日本語・英語は Tesseract.js を使用しており、本ドキュメントの対象外とする。

## ライセンス概要

### NDLOCR / NDLOCR-Lite（国立国会図書館）

- **ライセンス**: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **商用利用**: 可（適切な帰属表示が条件）
- **改変・再配布**: 可
- **公式情報**: [NDL Lab 公開告知（2022）](https://lab.ndl.go.jp/news/2022/2022-04-25/)、[ndl-lab/ndlocr-lite](https://github.com/ndl-lab/ndlocr-lite)

### ndlocrlite-web（Web 移植実装）

- **ライセンス**: CC BY 4.0（Copyright (c) 2025 Yuta Hashimoto）
- **リポジトリ**: [yuta1984/ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web)
- 本リポジトリの Worker・サーバー OCR コードはこの実装を参考にしている

### 利用している主要コンポーネント

| コンポーネント | 由来 | 備考 |
|----------------|------|------|
| DEIMv2（レイアウト検出） | NDLOCR-Lite / [DEIM](https://github.com/ShihuaHuang95/DEIM) | `deim-s-1024x1024.onnx` |
| PARSeq（文字認識） | NDLOCR-Lite / [PARSeq](https://github.com/baudm/parseq) | ndlocrlite-web 改良版 tiny モデル（3 段カスケード） |
| 文字セット | 国立国会図書館 | `public/ocr/config/NDLmoji.yaml` |
| ONNX Runtime | Microsoft | ブラウザ WASM / サーバー Node 推論 |

モデルファイルは初回利用時に R2（`NDL_OCR_MODEL_UPSTREAM_URL`）または `/api/ndlocr-models/*` 経由で取得し、ブラウザでは IndexedDB、サーバーでは `.cache/ndlocr-models/` にキャッシュする。

## 守るべき条件

CC BY 4.0 に基づき、以下を満たすこと。

1. **帰属表示（Attribution）**  
   NDLOCR-Lite および ndlocrlite-web の利用であることを明示する。例:
   - 「縦書き OCR に NDLOCR-Lite（国立国会図書館）を利用」
   - 「Web 移植実装: [ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web)（CC BY 4.0）」
   - 改変している場合はその旨を記載する

2. **ライセンス表示**  
   CC BY 4.0 であること、および [ライセンス全文へのリンク](https://creativecommons.org/licenses/by/4.0/) を示す。

3. **依存 OSS の遵守**  
   ONNX モデルやバイナリを再配布する場合（R2 ホスティング、Docker イメージ同梱など）、DEIM・PARSeq・onnxruntime 等の個別ライセンス条項も確認する。NDLOCR-Lite 側の依存一覧は upstream の `LICENCE_DEPENDENCEIES`（[ndlocr-lite リポジトリ](https://github.com/ndl-lab/ndlocr-lite)）を参照。

4. **商標・ブランド**  
   CC BY 4.0 は商標使用権を付与しない。国立国会図書館のロゴ等を、公式提携を示唆する形で使わない。

5. **無保証**  
   ソフトウェアは AS-IS で提供される。OCR 精度・可用性について NDL 側の保証はない。

## OCR 結果テキストについて

ユーザーがスキャン・PDF から得た **OCR 出力テキスト** は、利用者自身の資料のデジタル化結果である。CC BY 4.0 の義務は主に **OCR エンジン（ソフトウェア・モデル）の利用と再配布** に関するものであり、通常のサービス利用（テキストを KG 化して保存・表示する）だけでは、出力テキスト自体に NDL のクレジットを毎回付与する必要はない。

## 本リポジトリでの対応方針

- **開発者向け**: 本ドキュメント（`docs/ndlocr-license.md`）に要件を集約する
- **関連フロー**: [フィールドスキャン](./field-research-scan-flow.md)、[Drive 同期 / PDF OCR](./topic-space-drive-sync.md) から本ページへリンクする
- **About ページ**: OCR 機能を説明していない限り掲載しない。将来 UI で OCR を案内する場合は、利用規約・クレジットページ等への追記を検討する

## 参考リンク

- [NDLOCR-Lite（GitHub）](https://github.com/ndl-lab/ndlocr-lite)
- [ndlocrlite-web（GitHub）](https://github.com/yuta1984/ndlocrlite-web)
- [CC BY 4.0 要約（日本語）](https://creativecommons.org/licenses/by/4.0/deed.ja)
- [フィールドスキャン OCR フロー](./field-research-scan-flow.md)
- [TopicSpace Drive 同期 / PDF パイプライン](./topic-space-drive-sync.md)
