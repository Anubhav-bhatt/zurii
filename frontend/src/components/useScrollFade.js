import { useEffect, useRef, useState } from "react";

export const useScrollFade = ({
  threshold = 0.05,
  rootMargin = "0px 0px -20px 0px",
  once = true
} = {}) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) obs.unobserve(entry.target);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    obs.observe(el);

    return () => obs.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, isVisible];
};
