"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { AddProjectWizard } from "@/components/onboarding/AddProjectWizard";

/**
 * Add Project dialog — now opens the ten-step onboarding wizard
 * (Screen_Navigation.md §7) instead of the old three-field form.
 *
 * Props are preserved so existing callers (`/projects` header, empty state)
 * keep working. `navigateOnCreate` is retained for API compatibility; the
 * wizard's Setup Complete step links to the dashboard via Open Dashboard
 * rather than auto-navigating away from the success state.
 *
 * Chrome/behaviour now comes from the shared `Modal` shell (Escape, backdrop
 * click, scroll lock, focus move/restore, focus trap, reduced motion).
 */
export function AddProjectDialog({
  triggerClassName,
  triggerLabel = "Add project",
  navigateOnCreate = false,
}: {
  triggerClassName?: string;
  triggerLabel?: string;
  navigateOnCreate?: boolean;
}) {
  void navigateOnCreate;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded bg-brand px-3.5 text-[14px] font-semibold text-white shadow-md transition-all hover:bg-brand-hover hover:shadow-lg active:scale-[0.99]",
          triggerClassName,
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="Add a project"
        hideCloseButton
        panelClassName="flex w-[min(100%-2rem,64rem)] flex-col overflow-hidden p-0"
      >
        <AddProjectWizard
          onExit={() => setOpen(false)}
          onComplete={() => router.refresh()}
        />
        <p className="shrink-0 border-t border-border-hairline px-5 py-2.5 text-center text-[12px] text-ink-muted">
          Prefer a full page?{" "}
          <a
            href="/projects/new"
            className="font-medium text-brand hover:text-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Open the wizard as a page
          </a>
          .
        </p>
      </Modal>
    </>
  );
}