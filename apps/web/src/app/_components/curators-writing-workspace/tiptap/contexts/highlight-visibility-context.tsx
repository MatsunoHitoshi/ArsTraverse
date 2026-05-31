"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

interface HighlightVisibilityContextType {
  isHighlightVisible: boolean;
  toggleHighlightVisibility: () => void;
  setHighlightVisibility: (visible: boolean) => void;
}

const HighlightVisibilityContext = createContext<
  HighlightVisibilityContextType | undefined
>(undefined);

export { HighlightVisibilityContext };

interface HighlightVisibilityProviderProps {
  children: ReactNode;
  initialValue?: boolean;
}

export const HighlightVisibilityProvider: React.FC<
  HighlightVisibilityProviderProps
> = ({ children, initialValue = true }) => {
  const [isHighlightVisible, setIsHighlightVisible] = useState(initialValue);

  // initialValueが変更されたときに状態を更新
  useEffect(() => {
    setIsHighlightVisible(initialValue);
  }, [initialValue]);

  const toggleHighlightVisibility = () => {
    setIsHighlightVisible((prev) => !prev);
  };

  const setHighlightVisibility = (visible: boolean) => {
    setIsHighlightVisible(visible);
  };

  return (
    <HighlightVisibilityContext.Provider
      value={{
        isHighlightVisible,
        toggleHighlightVisibility,
        setHighlightVisibility,
      }}
    >
      {children}
    </HighlightVisibilityContext.Provider>
  );
};

export const useHighlightVisibility = (): HighlightVisibilityContextType => {
  const context = useContext(HighlightVisibilityContext);
  if (context === undefined) {
    throw new Error(
      "useHighlightVisibility must be used within a HighlightVisibilityProvider",
    );
  }
  return context;
};
