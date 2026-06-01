"use client";

import { useInView } from "react-intersection-observer";

export const FadeIn = ({ children }: { children: React.ReactNode }) => {
  const { ref, inView } = useInView({
    // Exclude only the bottom edge; top inset hid above-the-fold pages like /field.
    rootMargin: "0px 0px -100px 0px",
    triggerOnce: true,
  });

  const fadeInClassName = inView ? "animate-fade-in" : "opacity-0";
  return (
    <div ref={ref} className={fadeInClassName}>
      {children}
    </div>
  );
};
