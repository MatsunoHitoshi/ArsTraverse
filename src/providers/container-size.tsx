"use client";
import { useLayoutEffect } from "react";

export const ContainerSizeProvider = ({
  children,
  containerRef,
  className,
  setContainerWidth,
  setContainerHeight,
}: {
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
  className?: string;
  setContainerWidth?: React.Dispatch<React.SetStateAction<number>>;
  setContainerHeight?: React.Dispatch<React.SetStateAction<number>>;
}) => {
  useLayoutEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth?.(rect.width);
      }
      if (rect.height > 0) {
        setContainerHeight?.(rect.height);
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    const element = containerRef.current;
    if (element) {
      resizeObserver.observe(element);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, setContainerWidth, setContainerHeight]);

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
};
