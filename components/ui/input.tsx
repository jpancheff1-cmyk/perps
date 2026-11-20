import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-full border border-[#3A2414] bg-[#140E0A] px-3 text-sm text-[#FFF4EA] outline-none placeholder:text-[#C9A88E]/70 focus:border-[#FF8A1F]",
        className,
      )}
      {...props}
    />
  );
}
