import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn("h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-12 text-sm disabled:opacity-50", className)}
        {...props}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
