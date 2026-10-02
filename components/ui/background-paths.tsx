"use client";

/**
 * Adapted from kokonutd/background-paths (MIT, https://kokonutui.com).
 * Re-themed for the DevOps Safeguard light enterprise theme (Design.md):
 * - Light canvas background (#F8FAFC), no dark full-screen wrapper.
 * - Brand-anchored gradient (brand blue -> teal -> info) at low alpha.
 * - Thin strokes + low opacity so hero copy/terminal stay dominant.
 * - Background-only export (no title) for embedding in the Hero section.
 * - Respects prefers-reduced-motion via motion/react.
 */

import { motion, useReducedMotion } from "motion/react";
import { memo, useId, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Point {
  x: number;
  y: number;
}

interface PathData {
  id: string;
  d: string;
  opacity: number;
  width: number;
}

function generateAestheticPath(
  index: number,
  position: number,
  type: "primary" | "secondary" | "accent",
): string {
  const baseAmplitude =
    type === "primary" ? 150 : type === "secondary" ? 100 : 60;
  const phase = index * 0.2;
  const points: Point[] = [];
  const segments = type === "primary" ? 10 : type === "secondary" ? 8 : 6;

  const startX = 2400;
  const startY = 800;
  const endX = -2400;
  const endY = -800 + index * 25;

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const eased = 1 - (1 - progress) ** 2;

    const baseX = startX + (endX - startX) * eased;
    const baseY = startY + (endY - startY) * eased;

    const amplitudeFactor = 1 - eased * 0.3;
    const wave1 =
      Math.sin(progress * Math.PI * 3 + phase) *
      (baseAmplitude * 0.7 * amplitudeFactor);
    const wave2 =
      Math.cos(progress * Math.PI * 4 + phase) *
      (baseAmplitude * 0.3 * amplitudeFactor);
    const wave3 =
      Math.sin(progress * Math.PI * 2 + phase) *
      (baseAmplitude * 0.2 * amplitudeFactor);

    points.push({
      x: baseX * position,
      y: baseY + wave1 + wave2 + wave3,
    });
  }

  // Round every emitted coordinate to 2 decimals. The wave math above uses
  // Math.sin / Math.cos, whose precision is implementation-defined per the
  // ECMAScript spec — so Node (server render) and the browser (hydration)
  // produce values that differ in the last few digits. Emitting those raw
  // makes the SVG `d` string differ between server and client, which trips a
  // React hydration mismatch and forces a full client re-render (a flash of
  // unstyled/re-mounted content on reload). Rounding collapses those tiny
  // differences so both sides serialise the exact same path.
  const n = (value: number): string => value.toFixed(2);

  return points
    .map((point, i) => {
      if (i === 0) return `M ${n(point.x)} ${n(point.y)}`;
      const prev = points[i - 1];
      const tension = 0.4;
      const cp1x = prev.x + (point.x - prev.x) * tension;
      const cp1y = prev.y;
      const cp2x = prev.x + (point.x - prev.x) * (1 - tension);
      const cp2y = point.y;
      return `C ${n(cp1x)} ${n(cp1y)}, ${n(cp2x)} ${n(cp2y)}, ${n(point.x)} ${n(point.y)}`;
    })
    .join(" ");
}

const FloatingPaths = memo(function FloatingPaths({
  position,
  gradientId,
  staticOnly = false,
}: {
  position: number;
  gradientId: string;
  staticOnly?: boolean;
}) {
  const primaryPaths: PathData[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: `primary-${position}-${i}`,
        d: generateAestheticPath(i, position, "primary"),
        opacity: 0.1 + i * 0.012,
        width: 1.2 + i * 0.12,
      })),
    [position],
  );

  const secondaryPaths: PathData[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: `secondary-${position}-${i}`,
        d: generateAestheticPath(i, position, "secondary"),
        opacity: 0.08 + i * 0.01,
        width: 1 + i * 0.1,
      })),
    [position],
  );

  const accentPaths: PathData[] = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: `accent-${position}-${i}`,
        d: generateAestheticPath(i, position, "accent"),
        opacity: 0.06 + i * 0.01,
        width: 0.8 + i * 0.08,
      })),
    [position],
  );

  if (staticOnly) {
    return (
      <>
        <g>
          {primaryPaths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke={`url(#${gradientId})`}
              strokeLinecap="round"
              strokeWidth={p.width}
              opacity={p.opacity}
              fill="none"
            />
          ))}
        </g>
        <g opacity={0.8}>
          {secondaryPaths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke={`url(#${gradientId})`}
              strokeLinecap="round"
              strokeWidth={p.width}
              opacity={p.opacity}
              fill="none"
            />
          ))}
        </g>
        <g opacity={0.6}>
          {accentPaths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke={`url(#${gradientId})`}
              strokeLinecap="round"
              strokeWidth={p.width}
              opacity={p.opacity}
              fill="none"
            />
          ))}
        </g>
      </>
    );
  }

  return (
    <>
      <g>
        {primaryPaths.map((p) => (
          <motion.path
            key={p.id}
            d={p.d}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, y: [0, -15, 0] }}
            transition={{
              opacity: { duration: 1 },
              scale: { duration: 1 },
              y: {
                duration: 8,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
                repeatType: "reverse",
              },
            }}
            stroke={`url(#${gradientId})`}
            strokeLinecap="round"
            strokeWidth={p.width}
            style={{ opacity: p.opacity }}
            fill="none"
          />
        ))}
      </g>
      <g opacity={0.8}>
        {secondaryPaths.map((p) => (
          <motion.path
            key={p.id}
            d={p.d}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
            transition={{
              opacity: { duration: 1 },
              scale: { duration: 1 },
              y: {
                duration: 6,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
                repeatType: "reverse",
              },
            }}
            stroke={`url(#${gradientId})`}
            strokeLinecap="round"
            strokeWidth={p.width}
            style={{ opacity: p.opacity }}
            fill="none"
          />
        ))}
      </g>
      <g opacity={0.6}>
        {accentPaths.map((p) => (
          <motion.path
            key={p.id}
            d={p.d}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
            transition={{
              opacity: { duration: 1 },
              scale: { duration: 1 },
              y: {
                duration: 4,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
                repeatType: "reverse",
              },
            }}
            stroke={`url(#${gradientId})`}
            strokeLinecap="round"
            strokeWidth={p.width}
            style={{ opacity: p.opacity }}
            fill="none"
          />
        ))}
      </g>
    </>
  );
});

/**
 * Hero-ready background. Renders only the animated SVG paths
 * (no full-screen wrapper, no title) so it can sit absolutely
 * behind existing hero content.
 */
export const BackgroundPaths = memo(function BackgroundPaths({
  className,
}: {
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradientId = `hero-paths-${rawId}`;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <svg
        className="h-full w-full"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        viewBox="-2400 -800 4800 1600"
      >
        <title>Background Paths</title>
        <defs>
          <linearGradient
            id={gradientId}
            x1="0%"
            x2="100%"
            y1="0%"
            y2="0%"
          >
            <stop offset="0%" stopColor="rgba(21, 94, 239, 0.4)" />
            <stop offset="50%" stopColor="rgba(15, 118, 110, 0.32)" />
            <stop offset="100%" stopColor="rgba(3, 105, 161, 0.4)" />
          </linearGradient>
        </defs>
        <FloatingPaths
          position={1}
          gradientId={gradientId}
          staticOnly={prefersReducedMotion ?? false}
        />
      </svg>
    </div>
  );
});

export default BackgroundPaths;
