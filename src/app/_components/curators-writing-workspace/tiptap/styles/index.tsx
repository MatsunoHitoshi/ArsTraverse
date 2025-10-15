export const TiptapStyles = () => {
  return (
    <style jsx global>{`
      .ProseMirror {
        outline: none;
        height: 100%;
        min-height: 200px;
        color: white;
        font-family: inherit;
        line-height: 1.6;
      }

      .ProseMirror p {
        margin: 0.5em 0;
      }

      .ProseMirror p:first-child {
        margin-top: 0;
      }

      .ProseMirror p:last-child {
        margin-bottom: 0;
      }

      /* 見出しスタイル */
      .ProseMirror h1 {
        font-size: 1.5rem;
        font-weight: bold;
        margin: 1rem 0 0.5rem 0;
      }

      .ProseMirror h2 {
        font-size: 1.25rem;
        font-weight: bold;
        margin: 0.75rem 0 0.5rem 0;
      }

      .ProseMirror h3 {
        font-size: 1.125rem;
        font-weight: bold;
        margin: 0.5rem 0 0.25rem 0;
      }

      .ProseMirror span[data-entity-name].entity-highlight {
        cursor: pointer !important;
        transition: background-color 0.2s !important;
        display: inline-block !important;
        text-decoration: underline !important;
        text-decoration-style: dashed !important;
        text-underline-offset: 4px !important;
        text-decoration-thickness: 1px !important;
      }

      .ProseMirror span[data-entity-name].entity-highlight:hover {
        background-color: #fde68a !important;
        color: #000000 !important;
      }

      /* ハイライト表示/非表示の制御 */
      .ProseMirror.hide-highlights span[data-entity-name].entity-highlight {
        text-decoration: none !important;
        background-color: transparent !important;
        color: inherit !important;
        cursor: default !important;
        pointer-events: none !important;
      }

      .ProseMirror.hide-highlights
        span[data-entity-name].entity-highlight:hover {
        background-color: transparent !important;
        color: inherit !important;
      }

      /* TEIタグのハイライトも非表示にする */
      .ProseMirror.hide-highlights span[data-pers-name="true"],
      .ProseMirror.hide-highlights span[data-place-name="true"],
      .ProseMirror.hide-highlights span[data-artwork="true"],
      .ProseMirror.hide-highlights span[data-event="true"] {
        text-decoration: none !important;
        pointer-events: none !important;
      }

      .ProseMirror .text-completion-mark {
        color: #6b7280 !important;
        opacity: 0.6 !important;
        user-select: none !important;
        pointer-events: none !important;
        font-style: italic !important;
      }

      .ProseMirror ul {
        list-style-type: disc !important;
      }
      .ProseMirror ol {
        list-style-type: decimal !important;
      }

      .ProseMirror ul,
      .ProseMirror ol {
        padding: 0 1rem;
        margin: 0.75rem 1rem 0.75rem 0.4rem;

        li p {
          margin-top: 0.25em;
          margin-bottom: 0.25em;
          margin-left: 0.25rem;
        }
      }
    `}</style>
  );
};
