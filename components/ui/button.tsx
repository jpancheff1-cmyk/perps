import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A1F]/70 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-[#FF8A1F] text-[#1A0E06] hover:bg-[#FFA94D]",
        outline: "border border-[#3A2414] bg-[#140E0A]/80 text-[#FFF4EA] hover:border-[#FF8A1F] hover:text-[#FFA94D]",
        ghost: "text-[#C9A88E] hover:bg-[#FF8A1F]/10 hover:text-[#FFF4EA]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
