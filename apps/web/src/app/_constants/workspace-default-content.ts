export const DEFAULT_EMPTY_WORKSPACE_CONTENT = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "ワークスペースの使い方" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "この文章は初期ガイドです。流れを確認したらこの文章を削除して、そのまま執筆を始められます。",
        },
      ],
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "1. 自由なスタイルで文章を書く" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "このエディタで文章を書くことができます（執筆した文章は自動保存されます）。見出し・太字・リスト・引用などを使って、読みやすい形に整えながら執筆できます。",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "見出しの例:",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: " 「第1章 背景」「第2章 論点」のように章立てして整理できます",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "太字の例:",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: " 重要語（",
                },
                {
                  type: "text",
                  text: "作品名",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: "・",
                },
                {
                  type: "text",
                  text: "人物名",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: "・",
                },
                {
                  type: "text",
                  text: "概念名",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: "）を強調できます",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "箇条書きの例:",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: " 要点を短く並べて、読み手が流れを追いやすくできます",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "2. 自動ハイライトで概念を参照する" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "文章執筆と資料参照を行き来する負荷を減らすため、資料から構築した知識グラフを情報リソースとして、執筆中に参照できるようにしています。テキストエディタで筋書きを書くと、参照しているグラフのノードに含まれる単語が自動でハイライトされます。",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "ハイライト語をクリックすると、右のグラフで当該ノードにフォーカスし、周辺の関連をたどれます",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "執筆しながら、どの概念がどの関係で登場しているかをその場で確認できます",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "以下は、テキストの自動ハイライトによって資料内情報を円滑に参照できる様子です。",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/autohighlight.gif",
        alt: "自動ハイライトと概念参照",
        title: "自動ハイライトと概念参照",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "さらに、絞り込んだグラフの下の窓から、選択ノードがどの資料でどう言及されるか（引用）を検索できます。関係性をたどりながら元の文章を確認する索引体験を提供します。",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/reference.gif",
        alt: "引用の検索",
        title: "引用の検索",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        { type: "text", text: "3. ストーリーテリングモードで構成を作る" },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "伝えたい筋書きだけでは補いきれない、資料内の周辺的な事柄をどのように補足して一つの説明にまとめるかが課題になります。ストーリーテリングモードでは、あなたが書いたテキストの順序に沿ってグラフをレイアウトし、知識グラフから検出したコミュニティを章内容と照合して割り当てます。",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "さらに段落単位でも、AI（大規模言語モデル）がノードとエッジを特定し、筋書きのどの部分がどこを指しているかを紐づけます。",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/storytelling.gif",
        alt: "ストーリー作成",
        title: "ストーリー作成",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "筋書きに合わせて周辺の知識グラフを対応させることで、筋書きの内容を補完しながら周辺情報も伝えられます。",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/storytelling2.gif",
        alt: "ストーリー作成",
        title: "ストーリー作成",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "最初にやるとよいこと" }],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "右上のワークスペース名を、自分のテーマに合わせて変更する",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "2〜3段落くらい書いて、自動ハイライトと右パネル参照の流れを試す",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "慣れてきたらストーリーテリングモードで全体構成を確認する",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "このガイド文は不要になったら削除して問題ありません。",
        },
      ],
    },
  ],
} as const;
