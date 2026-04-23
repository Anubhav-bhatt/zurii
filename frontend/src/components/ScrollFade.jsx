import { useScrollFade } from "./useScrollFade";

export const ScrollFade = ({
  children,
  className = "",
  delay = 0,
  duration = 350,
  once = true
}) => {
  const [ref, isVisible] = useScrollFade({ once });

  return (
    <div
      ref={ref}
      className={`transition-all ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(15px)",
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
};
