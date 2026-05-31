declare module "react-scrollama" {
  import type { FC, ReactNode } from "react";

  export interface ScrollamaStepCallbackArg<T = unknown> {
    element: HTMLElement;
    data: T;
    direction: "up" | "down";
    entry: IntersectionObserverEntry;
  }

  export interface ScrollamaProgressCallbackArg<T = unknown>
    extends ScrollamaStepCallbackArg<T> {
    progress: number;
  }

  export interface ScrollamaProps {
    offset?: number | string;
    threshold?: number;
    onStepEnter?: (arg: ScrollamaStepCallbackArg) => void;
    onStepExit?: (arg: ScrollamaStepCallbackArg) => void;
    onStepProgress?: (arg: ScrollamaProgressCallbackArg) => void;
    debug?: boolean;
    children?: ReactNode;
  }

  export interface StepProps {
    data?: unknown;
    children?: ReactNode;
  }

  export const Scrollama: FC<ScrollamaProps>;
  export const Step: FC<StepProps>;
}
