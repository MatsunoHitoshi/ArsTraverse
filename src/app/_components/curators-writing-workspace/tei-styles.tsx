import React from "react";

export const TeiStyles: React.FC = () => {
  return (
    <style jsx global>{`
      /* TEI要素のスタイル */
      .tei-element-wrapper {
        margin: 8px 0;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: #f9fafb;
      }

      .tei-element {
        position: relative;
      }

      .tei-element-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px;
        background: #e5e7eb;
        border-bottom: 1px solid #d1d5db;
        font-family: "Courier New", monospace;
        font-size: 12px;
      }

      .tei-tag-name {
        color: #374151;
        font-weight: 500;
      }

      .tei-remove-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
      }

      .tei-remove-btn:hover {
        background: #dc2626;
      }

      .tei-element-content {
        padding: 8px;
      }

      .tei-attributes {
        margin-bottom: 8px;
        padding: 8px;
        background: white;
        border: 1px solid #d1d5db;
        border-radius: 4px;
      }

      .tei-attribute-item {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .tei-attribute-item:last-child {
        margin-bottom: 0;
      }

      .tei-attr-key {
        font-family: "Courier New", monospace;
        font-size: 12px;
        color: #6b7280;
        min-width: 60px;
      }

      .tei-attr-value {
        flex: 1;
        padding: 2px 6px;
        border: 1px solid #d1d5db;
        border-radius: 3px;
        font-size: 12px;
      }

      .tei-attr-value:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 1px #3b82f6;
      }

      .tei-attr-remove {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 10px;
        line-height: 1;
      }

      .tei-attr-remove:hover {
        background: #dc2626;
      }

      .tei-add-attr-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 11px;
        cursor: pointer;
      }

      .tei-add-attr-btn:hover {
        background: #2563eb;
      }

      .tei-content {
        min-height: 20px;
        padding: 4px;
        border: 1px dashed #d1d5db;
        border-radius: 3px;
        background: white;
      }

      .tei-element-footer {
        padding: 4px 8px;
        background: #e5e7eb;
        border-top: 1px solid #d1d5db;
        font-family: "Courier New", monospace;
        font-size: 12px;
        color: #374151;
      }

      /* TEI属性マークのスタイル */
      .tei-attribute {
        background: #fef3c7;
        border: 1px solid #f59e0b;
        border-radius: 3px;
        padding: 1px 3px;
        font-size: 0.9em;
        position: relative;
      }

      .tei-attribute::before {
        content: attr(data-tei-attr) ": " attr(data-tei-value);
        position: absolute;
        top: -20px;
        left: 0;
        background: #1f2937;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
        z-index: 10;
      }

      .tei-attribute:hover::before {
        opacity: 1;
      }

      /* TEIタグパネルのスタイル */
      .tei-tag-panel {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .tei-tag-panel-content {
        background: white;
        border-radius: 8px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
      }

      .tei-tag-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #e5e7eb;
      }

      .tei-tag-panel-title {
        font-size: 20px;
        font-weight: 600;
        color: #111827;
      }

      .tei-tag-panel-close {
        color: #6b7280;
        font-size: 24px;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tei-tag-panel-close:hover {
        color: #374151;
      }

      .tei-tag-panel-body {
        padding: 16px;
        overflow-y: auto;
        max-height: 60vh;
      }

      .tei-tag-panel-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
      }

      .tei-form-group {
        margin-bottom: 16px;
      }

      .tei-form-label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: #374151;
        margin-bottom: 8px;
      }

      .tei-form-select,
      .tei-form-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }

      .tei-form-select:focus,
      .tei-form-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .tei-attribute-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .tei-attribute-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tei-attribute-key {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #f3f4f6;
        font-family: "Courier New", monospace;
        font-size: 12px;
        color: #6b7280;
      }

      .tei-attribute-value {
        flex: 2;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
      }

      .tei-attribute-value:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .tei-attribute-remove {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
      }

      .tei-attribute-remove:hover {
        background: #dc2626;
      }

      .tei-add-attribute {
        color: #3b82f6;
        background: none;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 4px 0;
      }

      .tei-add-attribute:hover {
        color: #2563eb;
      }

      .tei-preview {
        background: #f3f4f6;
        padding: 12px;
        border-radius: 6px;
        font-family: "Courier New", monospace;
        font-size: 12px;
        color: #374151;
        white-space: pre-wrap;
      }

      .tei-button {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .tei-button-primary {
        background: #3b82f6;
        color: white;
        border: none;
      }

      .tei-button-primary:hover:not(:disabled) {
        background: #2563eb;
      }

      .tei-button-primary:disabled {
        background: #9ca3af;
        cursor: not-allowed;
      }

      .tei-button-secondary {
        background: none;
        color: #6b7280;
        border: 1px solid #d1d5db;
      }

      .tei-button-secondary:hover {
        color: #374151;
        background: #f9fafb;
      }

      /* レスポンシブ対応 */
      @media (max-width: 640px) {
        .tei-tag-panel-content {
          width: 95%;
          margin: 16px;
        }

        .tei-attribute-row {
          flex-direction: column;
          align-items: stretch;
        }

        .tei-attribute-key,
        .tei-attribute-value {
          flex: none;
        }
      }
    `}</style>
  );
};
