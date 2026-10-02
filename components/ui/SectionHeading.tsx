import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-brand">
        {eyebrow}
      </p>
      <h2 className="text-balance text-3xl font-semibold leading-10 tracking-tight text-ink sm:text-4xl sm:leading-[44px]">
        {title}
      </h2>
      {lede ? (
        <p className="text-pretty text-base leading-7 text-ink-secondary">{lede}</p>
      ) : null}
    </div>
  );
}
