import { useScrollFade } from "./useScrollFade";

export const ScrollFade = ({
  children,
  className = "",
  delay = 0,
  duration = 350,
  once = true
}) => {
  const [ref, isVisible] = useScrollFade({ once });

  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      ref={ref}
      className={`transition-all ${className}`}
      style={prefersReduced ? {
        opacity: isVisible ? 1 : 0,
        transform: "none"
      } : {
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(8px)",
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      {children}
    </div>
  );
};
