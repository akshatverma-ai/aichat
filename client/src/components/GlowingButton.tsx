import { forwardRef } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowingButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "accent" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const GlowingButton = forwardRef<HTMLButtonElement, GlowingButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, ...props }, ref) => {
    
    const variants = {
      primary: "bg-[hsl(var(--primary))] text-black hover:shadow-[0_0_20px_rgba(0,229,255,0.6)] font-semibold border-transparent",
      accent: "bg-[hsl(var(--accent))] text-black hover:shadow-[0_0_20px_rgba(138,124,255,0.6)] font-semibold border-transparent",
      outline: "bg-transparent text-[hsl(var(--primary))] border-[hsl(var(--primary))/50] border hover:bg-[hsl(var(--primary))/10] hover:shadow-[0_0_15px_rgba(0,229,255,0.3)]",
      danger: "bg-[hsl(var(--destructive))] text-white hover:shadow-[0_0_20px_rgba(255,0,0,0.6)] border-transparent"
    };

    const sizes = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
      icon: "p-3"
    };

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "relative rounded-xl transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden",
          variants[variant],
          sizes[size],
          isLoading && "opacity-70 cursor-not-allowed",
          className
        )}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
        <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
      </motion.button>
    );
  }
);

GlowingButton.displayName = "GlowingButton";
