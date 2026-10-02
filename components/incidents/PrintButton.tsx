"use client";

import { Printer } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";

/**
 * Real "Print / Save as PDF" control — invokes the browser's own print dialog,
 * from which the user can save a PDF. No fabricated download button (§19): the
 * machine-readable export is a separate real JSON route handler.
 */
export function PrintButton() {
  return (
    <ActionButton
      variant="secondary"
      icon={<Printer className="h-4 w-4" aria-hidden="true" />}
      onClick={() => window.print()}
      className="print:hidden"
    >
      Print / Save as PDF
    </ActionButton>
  );
}
