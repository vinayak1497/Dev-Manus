"use client";

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefAttributes,
} from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  type DOMMotionComponents,
  type HTMLMotionProps,
  type MotionProps,
} from "motion/react";
import { cn } from "@/lib/utils";

interface SequenceContextValue {
  completeItem: (index: number) => void;
  activeIndex: number;
  sequenceStarted: boolean;
}

const SequenceContext = createContext<SequenceContextValue | null>(null);
const useSequence = () => useContext(SequenceContext);

const ItemIndexContext = createContext<number | null>(null);
const useItemIndex = () => useContext(ItemIndexContext);

const motionElements = {
  article: motion.article,
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  h5: motion.h5,
  h6: motion.h6,
  li: motion.li,
  p: motion.p,
  section: motion.section,
  span: motion.span,
} as const;

type MotionElementType = Extract<
  keyof DOMMotionComponents,
  keyof typeof motionElements
>;

type TerminalTypingMotionComponent = ComponentType<
  Omit<HTMLMotionProps<"span">, "ref"> & RefAttributes<HTMLElement>
>;

interface AnimatedSpanProps extends MotionProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  startOnView?: boolean;
}

export const AnimatedSpan = ({
  children,
  delay = 0,
  className,
  startOnView = false,
  ...props
}: AnimatedSpanProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });
  const sequence = useSequence();
  const itemIndex = useItemIndex();
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!sequence || itemIndex === null) return;
    if (!sequence.sequenceStarted) return;
    if (hasStarted) return;
    if (sequence.activeIndex === itemIndex) {
      setHasStarted(true);
    }
  }, [sequence, hasStarted, itemIndex]);

  const shouldAnimate = sequence
    ? hasStarted
    : startOnView
      ? isInView
      : true;

  return (
    <motion.div
      ref={elementRef}
      initial={{ opacity: 0, y: -5 }}
      animate={
        shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }
      }
      transition={{ duration: 0.3, delay: sequence ? 0 : delay / 1000 }}
      className={cn("grid text-sm font-normal tracking-tight", className)}
      onAnimationComplete={() => {
        if (!sequence) return;
        if (itemIndex === null) return;
        // In sequence mode `delay` acts as a hold after this line
        // completes, so phases (e.g. AI analysis) can breathe before
        // the next line appears.
        if (delay > 0) {
          window.setTimeout(() => sequence.completeItem(itemIndex), delay);
        } else {
          sequence.completeItem(itemIndex);
        }
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

interface TypingAnimationProps extends Omit<MotionProps, "children"> {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  as?: MotionElementType;
  startOnView?: boolean;
}

export const TypingAnimation = ({
  children,
  className,
  duration = 60,
  delay = 0,
  as: Component = "span",
  startOnView = true,
  ...props
}: TypingAnimationProps) => {
  if (typeof children !== "string") {
    throw new Error("TypingAnimation: children must be a string. Received:");
  }

  const MotionComponent = motionElements[
    Component
  ] as TerminalTypingMotionComponent;
  const [displayedText, setDisplayedText] = useState<string>("");
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });
  const sequence = useSequence();
  const itemIndex = useItemIndex();

  const hasSequence = sequence !== null;
  const sequenceStarted = sequence?.sequenceStarted ?? false;
  const sequenceActiveIndex = sequence?.activeIndex ?? null;
  const sequenceCompleteItemRef = useRef<
    SequenceContextValue["completeItem"] | null
  >(null);
  const sequenceItemIndexRef = useRef<number | null>(null);

  useEffect(() => {
    sequenceCompleteItemRef.current = sequence?.completeItem ?? null;
    sequenceItemIndexRef.current = itemIndex;
  }, [sequence?.completeItem, itemIndex]);

  useEffect(() => {
    let startTimeout: ReturnType<typeof setTimeout> | null = null;
    if (hasSequence && itemIndex !== null) {
      if (sequenceStarted && !started && sequenceActiveIndex === itemIndex) {
        setStarted(true);
      }
    } else if (!startOnView || isInView) {
      startTimeout = setTimeout(() => setStarted(true), delay);
    }
    return () => {
      if (startTimeout !== null) {
        clearTimeout(startTimeout);
      }
    };
  }, [
    delay,
    startOnView,
    isInView,
    started,
    hasSequence,
    sequenceActiveIndex,
    sequenceStarted,
    itemIndex,
  ]);

  useEffect(() => {
    let typingEffect: ReturnType<typeof setInterval> | null = null;
    if (started) {
      let i = 0;
      typingEffect = setInterval(() => {
        if (i < children.length) {
          setDisplayedText(children.substring(0, i + 1));
          i++;
        } else {
          if (typingEffect !== null) {
            clearInterval(typingEffect);
          }
          const completeItem = sequenceCompleteItemRef.current;
          const currentItemIndex = sequenceItemIndexRef.current;
          if (completeItem && currentItemIndex !== null) {
            completeItem(currentItemIndex);
          }
        }
      }, duration);
    }
    return () => {
      if (typingEffect !== null) {
        clearInterval(typingEffect);
      }
    };
  }, [children, duration, started]);

  return (
    <MotionComponent
      ref={elementRef}
      className={cn("text-sm font-normal tracking-tight", className)}
      {...props}
    >
      {displayedText}
      {started && displayedText.length < children.length ? (
        <span aria-hidden="true" className="terminal-cursor" />
      ) : null}
    </MotionComponent>
  );
};

interface TerminalProps {
  children: React.ReactNode;
  className?: string;
  sequence?: boolean;
  startOnView?: boolean;
  /** Fired once when the last sequence item completes. */
  onSequenceComplete?: () => void;
  /** Accessible label for the log region. */
  "aria-label"?: string;
}

export const Terminal = ({
  children,
  className,
  sequence = true,
  startOnView = true,
  onSequenceComplete,
  "aria-label": ariaLabel = "Terminal demonstration",
}: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const stickToBottomRef = useRef(true);
  const reduceMotion = useReducedMotion();
  const isInView = useInView(containerRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const sequenceHasStarted = sequence ? !startOnView || isInView : false;

  const contextValue = useMemo<SequenceContextValue | null>(() => {
    if (!sequence) return null;
    return {
      completeItem: (index: number) => {
        setActiveIndex((current) =>
          index === current ? current + 1 : current,
        );
      },
      activeIndex,
      sequenceStarted: sequenceHasStarted,
    };
  }, [sequence, activeIndex, sequenceHasStarted]);

  const wrappedChildren = useMemo(() => {
    if (!sequence) return children;
    const array = Children.toArray(children);
    return array.map((child, index) => (
      <ItemIndexContext.Provider key={index} value={index}>
        {child as React.ReactNode}
      </ItemIndexContext.Provider>
    ));
  }, [children, sequence]);

  const itemCount = sequence ? Children.toArray(children).length : 0;

  useEffect(() => {
    if (sequence && itemCount > 0 && activeIndex >= itemCount) {
      onSequenceComplete?.();
    }
  }, [sequence, itemCount, activeIndex, onSequenceComplete]);

  // Keep the newest line in view: as the sequence advances, glide the
  // viewport down so earlier lines scroll away instead of spilling past
  // the card. If the visitor scrolls up to read history, auto-follow
  // politely pauses until they return to the bottom edge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeIndex, sequenceHasStarted, reduceMotion]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 28;
  };

  const content = (
    <div
      ref={containerRef}
      role="log"
      aria-label={ariaLabel}
      className={cn(
        "z-0 flex h-full w-full flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-raised",
        className,
      )}
    >
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-border-hairline bg-surface px-4 sm:px-5">
        <div className="flex flex-row items-center gap-x-1.5" aria-hidden="true">
          <div className="h-2.5 w-2.5 rounded-full bg-critical/50"></div>
          <div className="h-2.5 w-2.5 rounded-full bg-warning/50"></div>
          <div className="h-2.5 w-2.5 rounded-full bg-success/50"></div>
        </div>
        <span className="ml-2 font-mono text-[11px] font-medium tracking-wide text-ink-secondary">
          safeguard · production
        </span>
        <span className="ml-auto hidden font-mono text-[11px] text-ink-muted sm:inline">
          prod-cluster-us-east-1
        </span>
      </div>
      <pre
        ref={scrollRef}
        onScroll={handleScroll}
        className="terminal-viewport min-h-0 flex-1 overflow-y-auto bg-canvas/60 px-5 py-4 sm:px-5 [scrollbar-gutter:stable] [scrollbar-width:thin]"
      >
        <code className="grid gap-y-1 font-mono">
          {wrappedChildren}
        </code>
      </pre>
    </div>
  );

  if (!sequence) return content;

  return (
    <SequenceContext.Provider value={contextValue}>
      {content}
    </SequenceContext.Provider>
  );
};

export default Terminal;
