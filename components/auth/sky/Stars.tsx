"use client";

import { memo } from "react";

/**
 * A small, deterministic star field.
 *
 * Positions and timings come from a fixed-seed generator evaluated once at
 * module scope, so the server and the client render byte-identical markup —
 * no hydration mismatch and no `Math.random()` during render.
 *
 * Only a third of the stars twinkle; the rest stay still so the field reads
 * as a sky rather than a blinking grid.
 */

type Star = {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
  still: boolean;
};

function makeStars(count: number): Star[] {
  let seed = 20261020;
  const random = () => {
    // Numerical Recipes LCG — deterministic across JS engines.
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  return Array.from({ length: count }, (_, index) => ({
    // Offsets keep the field away from the extreme edges.
    left: 2 + random() * 96,
    top: 2 + random() * 56,
    size: 1 + random() * 1.5,
    delay: random() * 7,
    duration: 4.5 + random() * 5,
    opacity: 0.25 + random() * 0.55,
    still: index % 3 === 0,
  }));
}

const STARS = makeStars(84);

export const Stars = memo(function Stars() {
  return (
    <div className="auth-stars">
      {STARS.map((star, index) => (
        <span
          key={index}
          className={star.still ? "auth-star auth-star--still" : "auth-star"}
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
    </div>
  );
});
