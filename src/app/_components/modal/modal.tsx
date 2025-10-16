"use client";

import React from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { Button } from "../button/button";
import { CrossLargeIcon } from "../icons";

type ModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
  title: string;
  size?: "small" | "medium" | "large" | "extra-large";
};

export const Modal = ({
  isOpen,
  setIsOpen,
  children,
  title,
  size = "medium",
}: ModalProps) => {
  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={() => setIsOpen(false)}
    >
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className={`data-[closed]:transform-[scale(95%)] flex max-h-[80svh] w-full flex-col gap-4 rounded-xl border border-gray-500 bg-slate-950/75 p-6 text-slate-50 backdrop-blur-3xl duration-300 ease-out data-[closed]:opacity-0 ${
              size === "small"
                ? "max-w-sm"
                : size === "medium"
                  ? "max-w-md"
                  : size === "large"
                    ? "max-w-2xl"
                    : size === "extra-large"
                      ? "max-w-4xl"
                      : "max-w-md"
            }`}
          >
            <div className="flex flex-row items-center justify-between">
              <DialogTitle as="h3" className="font-semibold">
                {title}
              </DialogTitle>
              <Button
                className="!h-8 !w-8 !bg-transparent !p-2 hover:!bg-slate-50/10"
                onClick={() => {
                  setIsOpen(false);
                }}
              >
                <CrossLargeIcon height={16} width={16} color="white" />
              </Button>
            </div>

            <div>{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};
