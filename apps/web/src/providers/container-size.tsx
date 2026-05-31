"use client";
import { useEffect } from "react";

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
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerWidth?.(rect.width);
        setContainerHeight?.(rect.height);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
};
