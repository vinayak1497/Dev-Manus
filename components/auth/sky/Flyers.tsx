"use client";

import { memo } from "react";

/**
 * Occasional distant traffic for the daytime scene: one small plane with a
 * faint contrail, and two loose groups of birds. Everything here is
 * decorative, slow, and hidden from assistive technology — and it is hidden
 * entirely for reduced-motion users and on small screens.
 */

export const Plane = memo(function Plane() {
  return (
    <div className="auth-plane auth-anim" aria-hidden="true">
      <span className="auth-plane__trail" />
      <svg viewBox="0 0 64 24" className="auth-plane__icon" focusable="false">
        <path
          fill="currentColor"
          d="M3 12.4 27.5 10 43.5 3 47.6 4 38 10.4 61 11.2 38 12.6 47.6 19.2 43.5 20.2 27.5 14 3 13.6Z"
        />
      </svg>
    </div>
  );
});

function Bird({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 10" className={className} focusable="false">
      <path
        d="M1 7.5C4.4 7.3 6.6 5.2 8 2c1.4 3.2 3.6 5.3 7 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const Birds = memo(function Birds() {
  return (
    <>
      <div className="auth-birds auth-birds--near auth-anim" aria-hidden="true">
        <Bird className="auth-birds__bird auth-birds__bird--lead" />
        <Bird className="auth-birds__bird auth-birds__bird--trail" />
      </div>
      <div className="auth-birds auth-birds--far auth-anim" aria-hidden="true">
        <Bird className="auth-birds__bird auth-birds__bird--lead" />
        <Bird className="auth-birds__bird auth-birds__bird--trail" />
      </div>
    </>
  );
});
