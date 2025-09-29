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

      .ProseMirror .text-completion-mark {
        color: #6b7280 !important;
        opacity: 0.6 !important;
        user-select: none !important;
        pointer-events: none !important;
        font-style: italic !important;
      }
    `}</style>
  );
};
