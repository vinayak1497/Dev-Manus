"use client";

import { memo, useEffect, useRef } from "react";
import { CloudBank } from "./CloudBank";
import { Stars } from "./Stars";
import { Moon } from "./Moon";
import { Birds, Plane } from "./Flyers";

/**
 * The living sky behind the authentication card.
 *
 * Both scenes are always mounted and crossfade by CSS when the
 * `data-auth-theme` attribute changes. The whole layer is decorative:
 * `aria-hidden`, `pointer-events-none`, and it pauses itself when the tab is
 * hidden so a backgrounded tab is not animating four cloud banks.
 */
export const SkyBackdrop = memo(function SkyBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sync = () => {
      root.setAttribute("data-paused", document.hidden ? "true" : "false");
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div
      ref={rootRef}
      className="auth-sky"
      data-paused="false"
      aria-hidden="true"
    >
      <div className="auth-scene auth-scene--day">
        <div className="auth-haze" />
        <div className="auth-clouds auth-clouds--far auth-anim">
          <CloudBank layer="far" variant={0} />
          <CloudBank layer="far" variant={1} />
        </div>
        <Plane />
        <Birds />
        <div className="auth-clouds auth-clouds--near auth-anim">
          <CloudBank layer="near" variant={0} />
          <CloudBank layer="near" variant={1} />
        </div>
      </div>

      <div className="auth-scene auth-scene--night">
        <Stars />
        <div className="auth-haze auth-haze--night" />
        <div className="auth-clouds auth-clouds--far auth-anim">
          <CloudBank layer="far" variant={0} />
          <CloudBank layer="far" variant={1} />
        </div>
        <Moon />
        <div className="auth-clouds auth-clouds--near auth-anim">
          <CloudBank layer="near" variant={0} />
          <CloudBank layer="near" variant={1} />
        </div>
      </div>

      <div className="auth-arc" />
    </div>
  );
});
