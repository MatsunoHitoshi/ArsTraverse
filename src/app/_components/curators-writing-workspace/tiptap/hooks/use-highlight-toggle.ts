import { useEffect, useContext } from "react";
import { HighlightVisibilityContext } from "../contexts/highlight-visibility-context";

export const useHighlightToggle = () => {
  // ハイライト表示状態を取得（プロバイダーが存在しない場合はデフォルトでtrue）
  const highlightContext = useContext(HighlightVisibilityContext);
  const isHighlightVisible = highlightContext?.isHighlightVisible ?? true;
  const toggleHighlightVisibility =
    highlightContext?.toggleHighlightVisibility ??
    (() => {
      console.warn("HighlightVisibilityProvider not found");
    });

  useEffect(() => {
    // ハイライトの表示状態に応じてCSSクラスを適用
    const editorElement = document.querySelector(".ProseMirror");
    if (editorElement) {
      if (isHighlightVisible) {
        editorElement.classList.remove("hide-highlights");
        editorElement.classList.add("show-highlights");
      } else {
        editorElement.classList.remove("show-highlights");
        editorElement.classList.add("hide-highlights");
      }
    }

    // ハイライト非表示時はクリックイベントを無効化
    const highlightElements = document.querySelectorAll(
      'span[data-entity-name].entity-highlight, span[data-pers-name="true"], span[data-place-name="true"], span[data-artwork="true"], span[data-event="true"]',
    );

    highlightElements.forEach((element) => {
      if (!isHighlightVisible) {
        element.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
          },
          { capture: true },
        );
      }
    });
  }, [isHighlightVisible]);

  return {
    isHighlightVisible,
    toggleHighlightVisibility,
  };
};
