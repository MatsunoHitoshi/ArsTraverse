import type { Editor } from "@tiptap/react";

export const performTextCompletionSuggestion = (
  editor: Editor,
  isUpdatingTextCompletionSuggestionRef: React.MutableRefObject<boolean>,
  suggestion?: string | null,
) => {
  console.log("performTextCompletionSuggestion");
  if (!editor || editor.isDestroyed || !suggestion) return;

  // テキスト補完更新中フラグを設定
  isUpdatingTextCompletionSuggestionRef.current = true;

  try {
    // 現在のカーソル位置を保存
    const currentSelection = editor.state.selection;

    // テキスト補完候補を取得
    const textCompletionSuggestions = suggestion;

    // テキスト補完候補を適用
    console.log("textCompletionSuggestions: ", textCompletionSuggestions);

    // 現在のカーソル位置にテキストを挿入
    editor.commands.insertContent(textCompletionSuggestions);

    // 挿入したテキストにマークを適用
    const textLength = textCompletionSuggestions.length;
    const selectionStart = currentSelection.from;
    const selectionEnd = currentSelection.from + textLength;

    console.log("Setting selection from:", selectionStart, "to:", selectionEnd);
    editor.commands.setTextSelection({
      from: selectionStart,
      to: selectionEnd,
    });

    console.log("Applying textCompletion mark");
    const result = editor.commands.setTextCompletion();

    // カーソル位置を元の位置に戻す（挿入したテキストの前にカーソルを配置）
    editor.commands.setTextSelection(currentSelection.from);
  } catch (error) {
    console.error("Error performing text completion suggestion:", error);
  } finally {
    // テキスト補完更新完了後にフラグをリセット
    setTimeout(() => {
      isUpdatingTextCompletionSuggestionRef.current = false;
    }, 100);
  }
};

// 推薦されたテキストを確定する処理
export const confirmTextCompletion = (
  editor: Editor,
  isUpdatingTextCompletionSuggestionRef: React.MutableRefObject<boolean>,
) => {
  if (!editor || editor.isDestroyed) return;

  // テキスト補完更新中フラグを設定
  isUpdatingTextCompletionSuggestionRef.current = true;

  try {
    // 現在のカーソル位置を保存
    const currentSelection = editor.state.selection;

    // カーソル位置から後方向にテキスト補完マークを検索
    const doc = editor.state.doc;
    let completionStart = -1;
    let completionEnd = -1;

    // カーソル位置から文書の最後まで検索
    for (let pos = currentSelection.from; pos < doc.content.size; pos++) {
      const resolved = doc.resolve(pos);
      const marks = resolved.marks();

      console.log(
        "Checking pos:",
        pos,
        "marks:",
        marks.map((m) => m.type.name),
      );

      // textCompletionマークがあるかチェック
      const hasTextCompletion = marks.some(
        (mark) => mark.type.name === "textCompletion",
      );

      if (hasTextCompletion) {
        if (completionStart === -1) {
          completionStart = pos;
        }
        completionEnd = pos + 1;
      } else if (completionStart !== -1) {
        // マークが終わったら検索終了
        break;
      }
    }

    // マークが見つからない場合は、カーソル位置の直後を検索
    if (completionStart === -1) {
      for (
        let pos = currentSelection.from + 1;
        pos < Math.min(currentSelection.from + 10, doc.content.size);
        pos++
      ) {
        const resolved = doc.resolve(pos);
        const marks = resolved.marks();

        const hasTextCompletion = marks.some(
          (mark) => mark.type.name === "textCompletion",
        );

        if (hasTextCompletion) {
          if (completionStart === -1) {
            completionStart = pos;
          }
          completionEnd = pos + 1;
        } else if (completionStart !== -1) {
          break;
        }
      }
    }

    // テキスト補完マークが見つかった場合、マークを削除
    if (completionStart !== -1 && completionEnd !== -1) {
      console.log(
        "Removing marks from:",
        completionStart,
        "to:",
        completionEnd,
      );

      editor.commands.setTextSelection({
        from: completionStart,
        to: completionEnd,
      });

      // マークを削除
      const unsetResult = editor.commands.unsetTextCompletion();

      // カーソル位置を確定したテキストの後に移動
      editor.commands.setTextSelection(completionEnd);

      // 念のため、全体のマークをクリア
      editor.commands.setTextSelection({
        from: 0,
        to: editor.state.doc.content.size,
      });
      editor.commands.unsetTextCompletion();

      // カーソル位置を元に戻す
      editor.commands.setTextSelection(completionEnd);
    }
  } catch (error) {
    console.error("Error confirming text completion:", error);
  } finally {
    // テキスト補完更新完了後にフラグをリセット
    setTimeout(() => {
      isUpdatingTextCompletionSuggestionRef.current = false;
    }, 100);
  }
};

// テキスト補完マークをクリアする処理
export const clearAndDeleteTextCompletionMarks = (
  editor: Editor,
  isUpdatingTextCompletionSuggestionRef: React.MutableRefObject<boolean>,
) => {
  if (!editor || editor.isDestroyed) return;

  // テキスト補完更新中フラグを設定
  isUpdatingTextCompletionSuggestionRef.current = true;

  try {
    // 文書全体からテキスト補完マークを検索して削除
    const doc = editor.state.doc;
    const completionRanges: { start: number; end: number }[] = [];

    // 文書全体を検索してテキスト補完マークの範囲を特定
    for (let pos = 0; pos < doc.content.size; pos++) {
      const resolved = doc.resolve(pos);
      const marks = resolved.marks();

      // textCompletionマークがあるかチェック
      const hasTextCompletion = marks.some(
        (mark) => mark.type.name === "textCompletion",
      );

      if (hasTextCompletion) {
        // 改行後かどうかを判定
        const isAfterNewline =
          pos === 0 || doc.textBetween(pos - 1, pos) === "\n";

        // マークの開始位置を記録
        const start = isAfterNewline ? pos : pos - 1;
        let end = isAfterNewline ? pos + 1 : pos;

        // マークが続く範囲を見つける
        pos++;
        while (pos < doc.content.size) {
          const nextResolved = doc.resolve(pos);
          const nextMarks = nextResolved.marks();
          const hasNextTextCompletion = nextMarks.some(
            (mark) => mark.type.name === "textCompletion",
          );

          if (hasNextTextCompletion) {
            end = pos + 1;
            pos++;
          } else {
            break;
          }
        }

        completionRanges.push({ start, end });
        pos--; // 次のループで現在の位置を再チェック
      }
    }

    // 後ろから削除して位置のずれを防ぐ
    for (let i = completionRanges.length - 1; i >= 0; i--) {
      const range = completionRanges[i];
      if (!range) continue;

      console.log(
        "Removing text completion from:",
        range.start,
        "to:",
        range.end,
      );

      // テキストを削除
      editor.commands.setTextSelection({
        from: range.start,
        to: range.end,
      });
      editor.commands.deleteSelection();
    }

    // カーソル位置を最初の削除位置に設定
    if (completionRanges.length > 0 && completionRanges[0]) {
      editor.commands.setTextSelection(completionRanges[0].start);
    }
  } catch (error) {
    console.error("Error clearing text completion marks:", error);
  } finally {
    // テキスト補完更新完了後にフラグをリセット
    setTimeout(() => {
      isUpdatingTextCompletionSuggestionRef.current = false;
    }, 100);
  }
};
