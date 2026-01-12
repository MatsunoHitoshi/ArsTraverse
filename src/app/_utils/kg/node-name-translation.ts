import type { GraphNode, GraphRelationship } from "@prisma/client";
import { LLMTranslator } from "@/server/lib/translation/llm-translator";

export async function completeTranslateProperties(graph: {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}) {
  const translator = new LLMTranslator();
  await translator.initialize();

  // すべてのノードで必要な翻訳を収集
  type TranslationRequest = {
    nodeIndex: number;
    sourceText: string;
    sourceLang: "ja" | "en";
    targetLang: "ja" | "en";
    propertyKey: "name_ja" | "name_en";
  };

  const translationRequests: TranslationRequest[] = [];

  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    const baseProps = node?.properties as Record<string, string>;

    const jaVal = baseProps.name_ja?.trim() ?? "";
    const enVal = baseProps.name_en?.trim() ?? "";
    const isIdentical = jaVal === enVal && jaVal !== "";

    // 日本語文字が含まれているかチェックするヘルパー
    const hasJapaneseChars = (text: string) =>
      /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(
        text,
      );

    // ケース0: 両方空の場合 → node.name を元に判定して翻訳
    if (!jaVal && !enVal) {
      const sourceText = node?.name ?? "";
      if (hasJapaneseChars(sourceText)) {
        // 名前が日本語 → name_jaに設定し、英語へ翻訳
        // ※後でmap処理で適用されるよう、ここではリクエストに追加するだけにするが、
        //   map処理側で元の値が入っていないと困るので、翻訳リクエストのソースとして扱う
        translationRequests.push({
          nodeIndex: i,
          sourceText: sourceText,
          sourceLang: "ja",
          targetLang: "en",
          propertyKey: "name_en",
        });
        // map処理時に name_ja には sourceText を入れる必要があるため、
        // このロジックは map 側でも考慮が必要だが、
        // ここでは翻訳リクエストを投げることに集中する。
      } else {
        // 名前が英語 → name_enに設定し、日本語へ翻訳
        translationRequests.push({
          nodeIndex: i,
          sourceText: sourceText,
          sourceLang: "en",
          targetLang: "ja",
          propertyKey: "name_ja",
        });
      }
      continue;
    }

    if ((!jaVal && enVal) || (isIdentical && !hasJapaneseChars(enVal))) {
      // 英語から日本語への翻訳が必要
      // ケース1: jaがなくてenがある
      // ケース2: 両方あるが同じ値で、かつ日本語を含まない（＝英語とみなす）→ jaを翻訳で上書き
      translationRequests.push({
        nodeIndex: i,
        sourceText: enVal,
        sourceLang: "en",
        targetLang: "ja",
        propertyKey: "name_ja",
      });
    } else if ((jaVal && !enVal) || (isIdentical && hasJapaneseChars(jaVal))) {
      // 日本語から英語への翻訳が必要
      // ケース1: enがなくてjaがある
      // ケース2: 両方あるが同じ値で、かつ日本語を含む（＝日本語とみなす）→ enを翻訳で上書き
      translationRequests.push({
        nodeIndex: i,
        sourceText: jaVal,
        sourceLang: "ja",
        targetLang: "en",
        propertyKey: "name_en",
      });
    }
  }

  // バッチ翻訳を実行
  const translationPairs = translationRequests.map((req) => ({
    sourceText: req.sourceText,
    sourceLang: req.sourceLang,
    targetLang: req.targetLang,
  }));

  const translationResults = await translator.translateBatch(translationPairs);

  // 翻訳結果をノードに適用
  const translatedNodes = graph.nodes.map((node, nodeIndex) => {
    const baseProps = {
      ...((node.properties ?? {}) as Record<string, string>),
    };
    const hasJa = !!baseProps.name_ja && baseProps.name_ja.trim() !== "";
    const hasEn = !!baseProps.name_en && baseProps.name_en.trim() !== "";

    // このノードに関連する翻訳リクエストを取得
    const requests = translationRequests.filter(
      (req) => req.nodeIndex === nodeIndex,
    );

    for (const req of requests) {
      const cacheKey = `${req.sourceText}:${req.sourceLang}:${req.targetLang}`;
      const translated = translationResults.get(cacheKey);
      if (translated) {
        baseProps[req.propertyKey] = translated;
      } else {
        // 翻訳に失敗した場合は、元のテキストまたはnode.nameを使用
        baseProps[req.propertyKey] = req.sourceText;
      }
    }

    // 両方ない場合は、node.nameをベースに設定
    if (!hasJa && !hasEn) {
      const hasJapaneseChars = (text: string) =>
        /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(
          text,
        );

      if (hasJapaneseChars(node.name)) {
        baseProps.name_ja = node.name;
        // name_en は翻訳結果が入っているはず（入ってなければ空のまま）
        const req = requests.find((r) => r.propertyKey === "name_en");
        if (req) {
          const cacheKey = `${req.sourceText}:${req.sourceLang}:${req.targetLang}`;
          const translated = translationResults.get(cacheKey);
          if (translated) baseProps.name_en = translated;
        }
        // 翻訳失敗等のフォールバック: name_enが空なら元の名前を入れる（やむを得ない）
        if (!baseProps.name_en) baseProps.name_en = node.name;
      } else {
        baseProps.name_en = node.name;
        // name_ja は翻訳結果が入っているはず
        const req = requests.find((r) => r.propertyKey === "name_ja");
        if (req) {
          const cacheKey = `${req.sourceText}:${req.sourceLang}:${req.targetLang}`;
          const translated = translationResults.get(cacheKey);
          if (translated) baseProps.name_ja = translated;
        }
        if (!baseProps.name_ja) baseProps.name_ja = node.name;
      }
    }

    console.log("translated properties: ", baseProps);
    return { ...node, properties: baseProps } as GraphNode;
  });

  return { nodes: translatedNodes, relationships: graph.relationships };
}
