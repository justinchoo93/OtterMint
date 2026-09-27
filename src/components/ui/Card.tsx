import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

const PADDING = {
  none: "",
  md: "p-5 sm:p-6",
  lg: "p-5 sm:px-8 sm:py-7",
} as const;

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div";
  padding?: keyof typeof PADDING;
}

/** The standard surface container: 16px radius, card surface, hairline border. */
export function Card({ as: Tag = "section", padding = "md", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx("rounded-card border border-line bg-surface", PADDING[padding], className)}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
}

/** Serif section title with an optional subtitle and a right-aligned actions slot. */
export function CardHeader({ title, subtitle, actions, headingLevel = 2 }: CardHeaderProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Heading className="font-serif text-[1.375rem] leading-[1.15] font-normal text-ink sm:text-title">
          {title}
        </Heading>
        {subtitle && <p className="text-caption text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
