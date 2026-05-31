"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "../button/button";
import { CrossLargeIcon } from "../icons";

type BottomSheetProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
};

export const BottomSheet = ({
  isOpen,
  setIsOpen,
  children,
}: BottomSheetProps) => {
  const [isDragging, setIsDragging] = useState(false);
  // dragOffsetは正の値（下に下げる）
  const [dragOffset, setDragOffset] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);

  // ハンドル部分の高さ
  const HANDLE_HEIGHT = 48;

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? 0;
    currentY.current = e.touches[0]?.clientY ?? 0;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touchY = e.touches[0]?.clientY ?? 0;
    currentY.current = touchY;
    const diff = touchY - startY.current; // 下方向が正

    if (isOpen) {
      // 開いている時：下にドラッグしたら追従する (diff > 0)
      // バウンス抵抗をつける：上にドラッグした場合、diffは負になる。
      // 抵抗係数をかけることで、指の移動よりも少なく移動させる
      if (diff < 0) {
        setDragOffset(diff * 0.3); // 抵抗係数 0.3
      } else {
        setDragOffset(diff);
      }
    } else {
      // 閉じている時
      setDragOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const diff = currentY.current - startY.current;

    if (isOpen) {
      // 開いている時
      if (diff > 100) {
        // 100px以上下げたら閉じる
        setIsOpen(false);
      }
    } else {
      // 閉じている時
      if (diff < -30) {
        // 30px以上上げたら開く
        setIsOpen(true);
      }
    }
    setDragOffset(0);
  };

  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
    }
  }, [isOpen]);

  const getTransform = () => {
    if (isDragging) {
      if (isOpen) {
        return `translateY(${dragOffset}px)`;
      } else {
        return `translateY(calc(100% - ${HANDLE_HEIGHT}px + ${dragOffset}px))`;
      }
    } else {
      if (isOpen) {
        return `translateY(0)`;
      } else {
        return `translateY(calc(100% - ${HANDLE_HEIGHT}px))`;
      }
    }
  };

  return (
    <div className="relative z-50 xl:hidden">
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-end overflow-hidden">
        <div
          className="pointer-events-auto mx-auto w-full max-w-md rounded-t-2xl border-t border-gray-700 bg-black/75 text-left align-middle shadow-xl backdrop-blur-sm"
          style={{
            transform: getTransform(),
            transition: isDragging ? "none" : "transform 300ms ease-out",
            paddingBottom: "env(safe-area-inset-bottom, 20px)", // 安全領域を確保
          }}
        >
          {/* 
            引き上げすぎた時に下が見えないように、擬似要素または余分なパディングで下部を延長するアプローチもあるが、
            ここではコンテナ自体の高さを十分に確保し、translateYで制御しているため、
            「さらに引き上げた時」に見切れてしまう問題に対処する。
            
            translateYがマイナス（上に移動）になった場合、下端が持ち上がってしまう。
            これを防ぐには、コンテナの下部に十分な余白（padding-bottom）を持たせるか、
            あるいは高さを 100% + バウンス分 にするか。
            
            ここでは、コンテンツの下に大きな余白エリアを追加して、背景色で塗りつぶす。
          */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[90vh] w-full translate-y-full bg-black/75 backdrop-blur-md" />

          {/* ドラッグハンドルエリア */}
          <div
            className="flex cursor-grab touch-none items-center justify-center pb-4 pt-4 active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => {
              if (!isOpen) setIsOpen(true);
            }}
          >
            <div className="h-1.5 w-12 rounded-full bg-slate-600" />
          </div>

          <div className="flex flex-col">
            {isOpen && (
              <div className="-mt-6 ml-auto flex w-max items-center justify-end px-6 pb-4">
                <Button
                  className="!h-8 !w-8 !bg-transparent !p-2 hover:!bg-slate-50/10"
                  onClick={() => setIsOpen(false)}
                >
                  <CrossLargeIcon height={16} width={16} color="white" />
                </Button>
              </div>
            )}
            <div className="max-h-[50dvh] overflow-y-auto pb-6">
              <div className="px-6 text-slate-300">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
