import React from "react";

export const TeiStyles = () => {
  return (
    <style jsx global>{`
      /* TEI要素のスタイル */
      span[data-pers-name="true"] {
        text-decoration: underline;
        text-decoration-color: rgba(255, 165, 0, 0.5);
        text-decoration-thickness: 2px;
      }

      span[data-place-name="true"] {
        text-decoration: underline;
        text-decoration-color: rgba(255, 50, 0, 0.5);
        text-decoration-thickness: 2px;
      }

      span[data-artwork="true"] {
        text-decoration: underline;
        text-decoration-color: rgba(50, 0, 255, 0.5);
        text-decoration-thickness: 2px;
      }

      span[data-event="true"] {
        text-decoration: underline;
        text-decoration-color: rgba(50, 255, 0, 0.5);
        text-decoration-thickness: 2px;
      }
    `}</style>
  );
};
