import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

export type OcrTextLanguage = "jpn" | "jpn_vert" | "eng";

type NormalizeOcrTextInput = {
  plainText: string;
  language?: OcrTextLanguage;
};

const LANGUAGE_GUIDANCE: Record<OcrTextLanguage, string> = {
  jpn: `- The source is horizontal Japanese OCR text.
- Remove spurious half-width spaces inserted between Japanese characters, punctuation, or numbers.
- Join line breaks that split a sentence or phrase in the middle. Keep intentional paragraph breaks.
- Do not rewrite wording unless an obvious OCR misread can be corrected without changing meaning.`,
  jpn_vert: `- The source is vertical Japanese OCR text.
- Remove spurious half-width spaces between characters.
- Preserve line breaks that likely represent vertical columns or stanza boundaries.
- Only merge lines when they clearly belong to the same horizontal phrase broken by OCR.`,
  eng: `- The source is English OCR text.
- Remove spurious spaces and fix hyphenation broken across line breaks.
- Join line breaks that split a sentence in the middle. Keep paragraph breaks.`,
};

function extractPlainTextFromLlmResponse(content: string): string {
  let text = content.trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:text|plaintext)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
  }

  return text;
}

export async function normalizeOcrTextWithLlm(
  input: NormalizeOcrTextInput,
): Promise<{ correctedText: string }> {
  const plainText = input.plainText.trim();
  if (!plainText) {
    throw new Error("整えるテキストが空です");
  }

  const language = input.language ?? "jpn";
  const llm = new ChatOpenAI({
    model: "gpt-5-nano",
    reasoning: { effort: "minimal" },
  });

  const prompt = `You clean OCR output for downstream knowledge-graph extraction.

Task:
- Fix formatting noise from OCR: stray half-width spaces, broken line wraps, and obvious layout artifacts.
- Preserve the original meaning, facts, names, numbers, and language.
- Do not add commentary, headings, bullet markers, or metadata.
- Return ONLY the cleaned plain text.

Language-specific guidance:
${LANGUAGE_GUIDANCE[language]}

OCR text:
"""
${plainText}
"""`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const correctedText = extractPlainTextFromLlmResponse(
    String(response.content ?? ""),
  );

  if (!correctedText) {
    throw new Error("AI によるテキスト整形の結果が空でした");
  }

  return { correctedText };
}
