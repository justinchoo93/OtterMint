import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent font-semibold text-on-accent hover:brightness-110",
  secondary:
    "border border-line bg-surface-raised font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink",
  ghost: "font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink",
};

// Every control is at least 44px tall on phones (below the sm breakpoint).
const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-xs sm:h-8",
  md: "h-11 px-3.5 text-sm sm:h-9",
};

// Square, padding-free sizes for icon-only buttons (no conflicting px-* classes).
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "h-11 w-11 sm:h-8 sm:w-8",
  md: "h-11 w-11 sm:h-9 sm:w-9",
};

/** The button look as a class string, for links that should read as buttons. */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; className?: string } = {}): string {
  return cx(BASE, VARIANTS[variant], iconOnly ? ICON_SIZES[size] : SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. Icon-only buttons must also pass aria-label. */
  icon?: ReactNode;
  /** Square button holding only the icon; requires aria-label. */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconOnly = false, className, type = "button", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, iconOnly, className })}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
