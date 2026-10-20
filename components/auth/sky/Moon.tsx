"use client";

import { memo } from "react";

/**
 * A clean SVG moon with a soft CSS halo. No texture asset: craters would cost
 * weight for something the card sits in front of.
 */
export const Moon = memo(function Moon() {
  return (
    <div className="auth-moon" aria-hidden="true">
      <span className="auth-moon__halo auth-anim" />
      <span className="auth-moon__disc" />
    </div>
  );
});
