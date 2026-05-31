"use client";

import { useInView } from "react-intersection-observer";
export const FadeIn = ({ children }: { children: React.ReactNode }) => {
  const { ref, inView } = useInView({
    rootMargin: "-100px",
    triggerOnce: true,
  });

  const fadeInClassName = inView ? "animate-fade-in" : "opacity-0";
  return (
    <div ref={ref} className={fadeInClassName}>
      {children}
    </div>
  );
};
