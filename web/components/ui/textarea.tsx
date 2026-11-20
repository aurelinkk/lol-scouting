import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition-colors " +
          "placeholder:text-ink-3 focus:border-accent focus:bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
