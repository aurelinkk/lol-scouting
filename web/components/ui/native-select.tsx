import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Liste déroulante native (accessible, pratique sur mobile) habillée comme le reste du site */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        data-slot="native-select"
        className="h-8 w-full cursor-pointer appearance-none rounded-full border border-border bg-surface pl-3 pr-8 text-[13px] text-ink outline-none transition-colors hover:border-ink-3 focus-visible:ring-2 focus-visible:ring-accent/50"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
    </span>
  );
}

export { NativeSelect };
