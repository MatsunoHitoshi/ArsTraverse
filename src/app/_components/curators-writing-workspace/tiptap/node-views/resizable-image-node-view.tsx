import React, { useEffect, useRef, useState } from "react";
import type { NodeViewProps } from "@tiptap/react";
import Image from "next/image";

export const ResizableImageNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
  editor,
}) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // nodeの属性を直接参照して、更新時に自動的に再計算されるようにする
  const attrs = node.attrs as {
    src?: string;
    alt?: string;
    width?: string;
    height?: string;
  };
  const src = attrs.src ?? "";
  const alt = attrs.alt ?? "";
  const width = attrs.width ? parseInt(attrs.width, 10) : null;
  const height = attrs.height ? parseInt(attrs.height, 10) : null;

  // 画像の自然なサイズを取得
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (imageRef.current && !naturalSize) {
      const img = imageRef.current;
      if (img.complete) {
        setNaturalSize({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } else {
        img.onload = () => {
          setNaturalSize({
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
      }
    }
  }, [naturalSize, src]);

  // リサイズ開始
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (!editor.isEditable) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: width ?? rect.width,
        height: height ?? rect.height,
      });
    }
  };

  // マウス移動処理
  useEffect(() => {
    if (!isResizing || !editor.isEditable) return;

    const handleMouseMove = (e: MouseEvent) => {
      const editorElement = editor.view.dom.getBoundingClientRect();

      if (isResizing && editor.isEditable) {
        // リサイズ処理
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;

        // 縦横比を維持
        const aspectRatio = naturalSize
          ? naturalSize.width / naturalSize.height
          : resizeStart.width / resizeStart.height;

        let newWidth = resizeStart.width + deltaX;
        let newHeight = resizeStart.height + deltaY;

        // 縦横比を維持するために、より大きな変化量に合わせる
        const widthChange = Math.abs(deltaX);
        const heightChange = Math.abs(deltaY);

        if (widthChange > heightChange) {
          newHeight = newWidth / aspectRatio;
        } else {
          newWidth = newHeight * aspectRatio;
        }

        // 最小サイズを制限
        const minSize = 50;
        if (newWidth < minSize) {
          newWidth = minSize;
          newHeight = newWidth / aspectRatio;
        }
        if (newHeight < minSize) {
          newHeight = minSize;
          newWidth = newHeight * aspectRatio;
        }

        // エディタ幅を超えないように制限
        const maxWidth = editorElement.width * 0.9;
        if (newWidth > maxWidth) {
          newWidth = maxWidth;
          newHeight = newWidth / aspectRatio;
        }

        updateAttributes({
          width: Math.round(newWidth).toString(),
          height: Math.round(newHeight).toString(),
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isResizing,
    resizeStart,
    naturalSize,
    updateAttributes,
    editor,
    width,
    height,
  ]);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    margin: "1.5rem 0",
    cursor: "default",
    outline: selected && editor.isEditable ? "4px solid #ef7234" : "none",
  };

  const imageStyle: React.CSSProperties = {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    ...(width && height
      ? {
          width: `${width}px`,
          height: `${height}px`,
          objectFit: "contain",
        }
      : {}),
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className="resizable-image-container"
      contentEditable={false}
    >
      <Image
        ref={imageRef}
        src={src}
        alt={alt}
        width={width ?? 100}
        height={height ?? 100}
        style={imageStyle}
        draggable={false}
      />
      {selected && editor.isEditable && (
        <div
          ref={resizeHandleRef}
          onMouseDown={handleResizeMouseDown}
          className="resize-handle"
          style={{
            position: "absolute",
            right: "-8px",
            bottom: "-8px",
            width: "16px",
            height: "16px",
            backgroundColor: "#ef7234",
            border: "2px solid white",
            borderRadius: "50%",
            cursor: "nwse-resize",
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
};
