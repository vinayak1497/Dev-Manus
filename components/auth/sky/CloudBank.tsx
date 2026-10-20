"use client";

import { memo, useId } from "react";

/**
 * One horizontal band of soft cumulus. Two copies of the SVG sit side by side
 * inside a 200%-wide track; the track translates by exactly one copy
 * (`-50%`), so the loop has no seam and no visible jump.
 *
 * Each cloud is the union of overlapping ellipses filled with ONE shared
 * gradient (user-space units, not per-ellipse), so the puffs fuse into a
 * single volume with no internal seams. A small static blur softens the
 * silhouette; the animation only moves the finished layer, so it is
 * rasterised once rather than per frame. No image assets, nothing to load.
 */

type Cluster = { x: number; y: number; s: number; o?: number };

const CLUSTERS: Record<"far" | "near", [Cluster[], Cluster[]]> = {
  /* High, small, low-contrast wisps. */
  far: [
    [
      { x: 240, y: 132, s: 0.62 },
      { x: 800, y: 96, s: 0.5 },
      { x: 1300, y: 146, s: 0.68 },
    ],
    [
      { x: 130, y: 104, s: 0.56 },
      { x: 610, y: 150, s: 0.72 },
      { x: 1120, y: 98, s: 0.52 },
      { x: 1450, y: 154, s: 0.58 },
    ],
  ],
  /* Larger bank hugging the bottom edge, with small distant puffs. */
  near: [
    [
      { x: 210, y: 470, s: 1.15 },
      { x: 590, y: 492, s: 1 },
      { x: 980, y: 468, s: 1.2 },
      { x: 1360, y: 492, s: 1.05 },
      { x: 170, y: 312, s: 0.66, o: 0.72 },
      { x: 1410, y: 300, s: 0.6, o: 0.6 },
    ],
    [
      { x: 230, y: 486, s: 1.05 },
      { x: 620, y: 466, s: 1.22 },
      { x: 1010, y: 492, s: 1.12 },
      { x: 1390, y: 468, s: 0.95 },
      { x: 330, y: 300, s: 0.6, o: 0.6 },
      { x: 1240, y: 318, s: 0.7, o: 0.72 },
    ],
  ],
};

/** Rounded cumulus puffs, offsets relative to the cluster origin. */
const CUMULUS = [
  { dx: -86, dy: 8, rx: 62, ry: 34 },
  { dx: -46, dy: -16, rx: 52, ry: 46 },
  { dx: -6, dy: -34, rx: 50, ry: 56 },
  { dx: 34, dy: -20, rx: 48, ry: 48 },
  { dx: 74, dy: 0, rx: 54, ry: 38 },
  { dx: 100, dy: 10, rx: 46, ry: 26 },
  { dx: 0, dy: 12, rx: 110, ry: 26 },
];

/** Flatter shapes for the distant layer — same silhouette, less volume. */
const CUMULUS_FLAT = [
  { dx: -90, dy: 0, rx: 78, ry: 24 },
  { dx: -34, dy: -16, rx: 60, ry: 34 },
  { dx: 8, dy: -26, rx: 62, ry: 40 },
  { dx: 52, dy: -12, rx: 56, ry: 28 },
  { dx: 98, dy: 2, rx: 66, ry: 20 },
  { dx: 0, dy: 8, rx: 124, ry: 18 },
];

export const CloudBank = memo(function CloudBank({
  layer,
  variant = 0,
}: {
  layer: "far" | "near";
  variant?: 0 | 1;
}) {
  // Gradient/filter ids must be unique per instance: eight banks render at
  // once (far/near x day/night x two copies) and duplicate ids would collide.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const bodyGradient = `cloud-body-${uid}`;
  const softFilter = `cloud-soft-${uid}`;
  const clusters = CLUSTERS[layer][variant];
  const puffs = layer === "near" ? CUMULUS : CUMULUS_FLAT;
  const height = layer === "near" ? 520 : 320;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 1600 ${height}`}
      className="auth-clouds__svg"
    >
      <defs>
        {/* Vertical light: cloud tops are lit, bases pick up the sky. */}
        <linearGradient
          id={bodyGradient}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2={height}
        >
          <stop offset="0%" style={{ stopColor: "var(--cloud-hi)" }} />
          <stop offset="55%" style={{ stopColor: "var(--cloud-mid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--cloud-low)" }} />
        </linearGradient>
        <filter
          id={softFilter}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      {clusters.map((cluster, clusterIndex) => (
        <g
          key={`${variant}-${clusterIndex}`}
          transform={`translate(${cluster.x} ${cluster.y}) scale(${cluster.s})`}
          filter={`url(#${softFilter})`}
          style={{
            opacity: cluster.o
              ? `calc(var(--cloud-opacity) * ${cluster.o})`
              : "var(--cloud-opacity)",
          }}
        >
          <g fill={`url(#${bodyGradient})`}>
            {puffs.map((puff, puffIndex) => (
              <ellipse
                key={puffIndex}
                cx={puff.dx}
                cy={puff.dy}
                rx={puff.rx}
                ry={puff.ry}
              />
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
});
