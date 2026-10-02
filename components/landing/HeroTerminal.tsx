"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  AnimatedSpan,
  Terminal,
  TypingAnimation,
} from "@/components/ui/terminal";
import { cn } from "@/lib/utils";

type Tone = "ok" | "neutral" | "info" | "warn" | "bad" | "ai" | "final";

type Line =
  | { kind: "command"; text: string; gap?: boolean }
  | { kind: "output"; tone: Tone; glyph: string; text: string; gap?: boolean }
  | { kind: "metric"; label: string; value: string }
  | { kind: "ai"; gap?: boolean }
  | { kind: "finale"; gap?: boolean };

/**
 * Compressed ShopEasy story, grouped in phases with breathing room
 * between groups. Short lines (~25–45 chars) for a 2–3 second scan.
 */
const SCRIPT: Line[] = [
  { kind: "command", text: "> safeguard connect ShopEasy" },
  { kind: "output", tone: "ok", glyph: "✔", text: "Repository connected" },
  { kind: "output", tone: "ok", glyph: "✔", text: "Production environment detected" },
  { kind: "command", text: "> safeguard analyze", gap: true },
  { kind: "output", tone: "ok", glyph: "✔", text: "Next.js · PostgreSQL · Kubernetes" },
  { kind: "output", tone: "ok", glyph: "✔", text: "Health endpoint · /api/health" },
  { kind: "command", text: "> safeguard monitor", gap: true },
  { kind: "output", tone: "neutral", glyph: "●", text: "Watching production signals…" },
  { kind: "output", tone: "warn", glyph: "⚠", text: "payments-service anomaly detected", gap: true },
  { kind: "command", text: "> safeguard investigate", gap: true },
  { kind: "metric", label: "p95 latency", value: "212ms → 486ms" },
  { kind: "metric", label: "DB queries", value: "+37%" },
  { kind: "metric", label: "deployment", value: "v1.8.2" },
  { kind: "ai", gap: true },
  { kind: "output", tone: "ok", glyph: "✔", text: "Incident created", gap: true },
  { kind: "output", tone: "ok", glyph: "✔", text: "Recovery monitoring active" },
  { kind: "finale", gap: true },
];

const toneClass = {
  ok: "text-success",
  neutral: "text-ink-secondary",
  info: "text-info",
  warn: "text-warning",
  bad: "text-critical",
  ai: "text-ai",
  final: "text-success",
} as const;

const REPLAY_HOLD_MS = 3000;
const SUMMARY =
  "DevOps Safeguard connects the ShopEasy repository in production, discovers its Next.js, PostgreSQL, and Kubernetes architecture, and monitors production signals. When a payments-service anomaly appears, it investigates latency, database load, and the v1.8.2 deployment, suggests a possible cause, creates an incident, and keeps monitoring. The system is safeguarded.";

const bodyText = "text-[12px] leading-5 lg:text-[13px]";

/**
 * Refined Apple-style activity window. Same animation and story as
 * before — only density, spacing, and type hierarchy were calmed down.
 */
export function HeroTerminal() {
  const prefersReducedMotion = useReducedMotion();
  const [cycle, setCycle] = useState(0);
  const holdTimer = useRef<number | null>(null);

  const handleComplete = useCallback(() => {
    if (prefersReducedMotion) return;
    if (holdTimer.current !== null) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setCycle((c) => c + 1);
    }, REPLAY_HOLD_MS);
  }, [prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    };
  }, []);

  const renderLine = (line: Line, key: string, instant = false) => {
    if (line.kind === "command") {
      if (instant) {
        return (
          <p key={key} className={cn("font-medium text-brand", bodyText, line.gap && "mt-3")}>
            {line.text}
          </p>
        );
      }
      return (
        <TypingAnimation
          key={key}
          duration={38}
          className={cn("font-medium text-brand", bodyText, line.gap && "mt-3")}
        >
          {line.text}
        </TypingAnimation>
      );
    }
    if (line.kind === "metric") {
      return (
        <AnimatedSpan
          key={key}
          delay={240}
          className={cn("flex items-baseline gap-x-2", bodyText)}
        >
          <span className="w-[104px] shrink-0 text-ink-secondary">{line.label}</span>
          <span className="min-w-0 font-medium text-ink">{line.value}</span>
        </AnimatedSpan>
      );
    }
    if (line.kind === "ai") {
      return (
        <AnimatedSpan
          key={key}
          delay={550}
          className={cn("block border-l-2 border-ai-border pl-3", bodyText, line.gap && "mt-3")}
        >
          <span className="block font-medium text-ai">
            <span aria-hidden="true">✦ </span>Safeguard AI
          </span>
          <span className="block text-ink-secondary">
            Possible cause: deployment v1.8.2
          </span>
        </AnimatedSpan>
      );
    }
    if (line.kind === "finale") {
      return (
        <AnimatedSpan
          key={key}
          delay={300}
          className={cn("block", bodyText, line.gap && "mt-3")}
        >
          <span className="block font-medium text-success">
            <span aria-hidden="true">✓ </span>SYSTEM SAFEGUARDED
          </span>
          <span className="block text-[11px] text-ink-secondary">
            Production monitoring active.
          </span>
        </AnimatedSpan>
      );
    }
    return (
      <AnimatedSpan
        key={key}
        delay={line.tone === "warn" ? 450 : 240}
        className={cn(
          "flex items-baseline gap-x-1.5 font-normal",
          bodyText,
          toneClass[line.tone],
          line.gap && "mt-3",
        )}
      >
        <span aria-hidden="true" className="shrink-0">{line.glyph}</span>
        <span className="min-w-0">{line.text}</span>
      </AnimatedSpan>
    );
  };

  if (prefersReducedMotion) {
    return (
      <div className="overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-raised">
        <div className="flex h-[44px] items-center gap-2 border-b border-border-hairline bg-surface px-4 sm:px-5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-critical/50" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-warning/50" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-success/50" />
          <span className="ml-2 font-mono text-[11px] font-medium tracking-wide text-ink-secondary">
            safeguard · production
          </span>
        </div>
        <div className="grid gap-y-1 bg-canvas/60 px-5 py-4 font-mono" role="log" aria-label={SUMMARY}>
          {SCRIPT.map((line, i) => renderLine(line, `static-${i}`, true))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Terminal
        key={cycle}
        sequence
        startOnView
        onSequenceComplete={handleComplete}
        aria-label="Animated demonstration: DevOps Safeguard connects ShopEasy, monitors production, correlates an anomaly, and safeguards the system"
        className="h-[440px] sm:h-[430px] lg:h-[450px]"
      >
        {SCRIPT.map((line, i) => renderLine(line, `${cycle}-${i}`))}
      </Terminal>
      <p className="sr-only">{SUMMARY}</p>
    </>
  );
}
