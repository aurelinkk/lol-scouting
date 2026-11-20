import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-colors " +
    "outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-white hover:bg-accent/90",
        soft: "border border-accent bg-accent-soft text-ink hover:bg-accent-soft/80",
        outline: "border border-border bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        link: "h-auto rounded-none px-0 font-normal text-accent underline-offset-2 hover:underline",
        destructive: "text-critical hover:bg-critical/10",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-9 px-4 text-sm",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
