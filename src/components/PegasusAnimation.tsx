import { useMemo } from "react";

const generateStars = (count: number, minSize: number, maxSize: number) => {
  return Array.from({ length: count }, () => {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const size = Math.random() * (maxSize - minSize) + minSize;
    const opacity = Math.random() * 0.5 + 0.2;
    return `${x}vw ${y}vh 0 ${size}px rgba(255,255,255,${opacity})`;
  }).join(", ");
};

export const PegasusAnimation = () => {
  const starsFar = useMemo(() => generateStars(220, 0.25, 0.7), []);
  const starsMid = useMemo(() => generateStars(160, 0.4, 1.0), []);
  const starsNear = useMemo(() => generateStars(90, 0.6, 1.3), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 bg-black">
      {/* Animated dark blue gradient background */}
      <div
        className="absolute inset-0 animated-blue-gradient"
        aria-hidden="true"
      />

      {/* Tiny floating stars drift over the image */}
      <div
        className="star-layer star-far"
        style={{ boxShadow: starsFar }}
        aria-hidden="true"
      />
      <div
        className="star-layer star-mid"
        style={{ boxShadow: starsMid }}
        aria-hidden="true"
      />
      <div
        className="star-layer star-near"
        style={{ boxShadow: starsNear }}
        aria-hidden="true"
      />

      {/* Professional dark vignette and black gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.85)_70%)]" />

      <style>{`
        .animated-blue-gradient {
          background: linear-gradient(
            -45deg,
            #000000 0%,
            #02040a 20%,
            #0a1229 40%,
            #111827 50%,
            #0a1229 60%,
            #02040a 80%,
            #000000 100%
          );
          background-size: 400% 400%;
          animation: blue-gradient-shift 22s ease infinite;
        }

        .animated-blue-gradient::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse at 50% 35%,
            rgba(220, 38, 38, 0.08) 0%,
            transparent 60%
          ),
          radial-gradient(
            ellipse at 20% 80%,
            rgba(153, 27, 27, 0.06) 0%,
            transparent 55%
          ),
          radial-gradient(
            ellipse at 80% 20%,
            rgba(185, 28, 28, 0.05) 0%,
            transparent 50%
          );
          animation: blue-glow-pulse 12s ease-in-out infinite alternate;
        }

        @keyframes blue-gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes blue-glow-pulse {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.05); }
        }

        .star-layer {
          position: absolute;
          inset: 0;
          width: 1px;
          height: 1px;
          border-radius: 9999px;
          will-change: transform;
          background: transparent;
        }
        .star-far {
          animation: stars-drift-far 100s linear infinite;
        }
        .star-mid {
          animation: stars-drift-mid 60s linear infinite;
        }
        .star-near {
          animation: stars-drift-near 35s linear infinite;
        }

        @keyframes stars-drift-far {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-12vw, -6vh, 0); }
        }
        @keyframes stars-drift-mid {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(18vw, -10vh, 0); }
        }
        @keyframes stars-drift-near {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-24vw, 14vh, 0); }
        }
      `}</style>
    </div>
  );
};
