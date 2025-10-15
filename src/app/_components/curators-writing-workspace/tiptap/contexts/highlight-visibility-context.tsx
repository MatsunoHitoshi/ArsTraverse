"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

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
}

export const HighlightVisibilityProvider: React.FC<
  HighlightVisibilityProviderProps
> = ({ children }) => {
  const [isHighlightVisible, setIsHighlightVisible] = useState(true);

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
