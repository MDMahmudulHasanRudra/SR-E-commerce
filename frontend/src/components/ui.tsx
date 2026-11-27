"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";
import { Sparkline } from "./charts";
import { initials, statusLabel, statusTone } from "@/lib/format";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-[#2c3028] shadow-sm",
  brand: "bg-brand text-white hover:bg-brand-hover shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-muted",
  ghost: "text-ink-soft hover:bg-[#eeece4]",
  danger: "bg-[#b4432f] text-white hover:bg-[#9c3827] shadow-sm",
  soft: "bg-brand-soft text-brand hover:bg-[#dcebe2]",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-sm",
  icon: "h-9 w-9 rounded-lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={size === "sm" ? 13 : 15} /> : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === "sm" ? 14 : 16} /> : null}
    </button>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full border-2 border-current border-r-transparent align-[-2px]", className)}
      style={{ width: size, height: size, animation: "spin 0.7s linear infinite" }}
    />
  );
}

/* ------------------------------------------------------------------- Badge */

export type Tone = "emerald" | "amber" | "zinc" | "blue" | "indigo" | "violet" | "rose" | "brand";

const toneClasses: Record<Tone, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  zinc: "border-[#e3e0d6] bg-[#f4f2eb] text-[#70746a]",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  brand: "border-[#cfe2d6] bg-brand-soft text-brand",
};

const dotClasses: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  zinc: "bg-[#9a9d92]",
  blue: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  brand: "bg-brand",
};

export function Badge({
  tone,
  children,
  dot = false,
  className,
}: {
  tone?: Tone | string;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const resolved = (tone && tone in toneClasses ? tone : "zinc") as Tone;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5",
        toneClasses[resolved],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[resolved])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, dot = true }: { status?: string | null; dot?: boolean }) {
  return (
    <Badge tone={statusTone(status)} dot={dot}>
      {statusLabel(status)}
    </Badge>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(23,25,20,0.03)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/* -------------------------------------------------------------- PageHeader */

export function PageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
        )}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Stats */

export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  deltaLabel,
  spark,
  sparkColor,
  tone = "brand",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  delta?: number;
  deltaLabel?: string;
  spark?: number[];
  sparkColor?: string;
  tone?: Tone;
  href?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  const content = (
    <Card className="group h-full transition-shadow hover:shadow-[0_2px_10px_rgba(23,25,20,0.06)]">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="num mt-2 truncate text-[25px] font-semibold leading-none tracking-[-0.02em] text-ink">
            {value}
          </p>
        </div>
        {icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", toneClasses[tone])}>
            <Icon name={icon} size={17} />
          </span>
        )}
      </div>
      <div className="flex min-h-[42px] items-end justify-between gap-2 px-5 pb-4">
        <div className="min-w-0">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
              )}
            >
              <Icon name={positive ? "arrowUp" : "arrowDown"} size={12} />
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {(hint || deltaLabel) && (
            <p className="mt-1.5 truncate text-[11px] text-muted">{hint ?? deltaLabel}</p>
          )}
        </div>
        {spark && spark.length > 1 && (
          <div className="shrink-0 opacity-90">
            <Sparkline data={spark} color={sparkColor ?? "#1d5d45"} width={92} height={30} fill />
          </div>
        )}
      </div>
    </Card>
  );
  if (href) {
    return (
      <a href={href} className="block h-full">
        {content}
      </a>
    );
  }
  return content;
}

/* ------------------------------------------------------------------ Inputs */

const fieldShell =
  "w-full rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-[#a6a99e] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-[#f3f1ea]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldShell, "h-10 px-3", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(fieldShell, "h-10 appearance-none bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371766b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 9 7 7 7-7'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldShell, "min-h-[88px] resize-y px-3 py-2.5", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="flex items-center gap-1 text-xs font-medium text-ink-soft">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
}) {
  return (
    <form
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#95998e]"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(fieldShell, "h-10 pl-9 pr-3")}
      />
    </form>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none",
          checked ? "bg-brand" : "bg-[#d8d5c9]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-xs font-medium text-ink-soft">{label}</span>}
          {description && <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------- Table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-left text-[13px]", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-[#faf9f5] text-[10.5px] uppercase tracking-[0.08em] text-muted">
      {children}
    </thead>
  );
}

export function TH({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  align = "left",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-[#efede5] px-4 py-3 align-middle last:border-0",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TR({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-[#faf9f5]",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#0e100c]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "animate-scale-in my-auto w-full rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl",
          widths[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-ink">
                  {title}
                </h2>
              )}
              {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[#f1efe8] hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-[#faf9f5] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">{description}</p>
    </Modal>
  );
}

/* -------------------------------------------------------------------- Tabs */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-[#ecebe4] p-1", className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-surface text-ink shadow-sm ring-1 ring-black/[0.03]"
                : "text-muted hover:text-ink-soft",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] leading-4",
                  active ? "bg-brand-soft text-brand" : "bg-[#e1dfd5] text-muted",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- Pagination */

export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPage,
  label = "items",
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between px-4 py-3 text-[11px] text-muted">
        <span>
          {totalCount} {label}
        </span>
      </div>
    );
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-[11px] text-muted">
        Showing <span className="num font-medium text-ink-soft">{from}</span>–
        <span className="num font-medium text-ink-soft">{to}</span> of{" "}
        <span className="num font-medium text-ink-soft">{totalCount}</span> {label}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <Icon name="chevronLeft" size={15} />
        </Button>
        <span className="px-2 text-[11px] text-muted">
          Page <span className="num font-medium text-ink-soft">{page}</span> of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <Icon name="chevronRight" size={15} />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Empty */

export function EmptyState({
  icon = "box",
  title,
  description,
  action,
  compact,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "py-14")}>
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-[#faf9f5] text-muted">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn("h-4", columnIndex === 0 ? "w-1/3" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <Icon name="alert" size={18} />
      </span>
      <h3 className="text-sm font-medium text-ink">Could not load this data</h3>
      <p className="mt-1 max-w-sm text-xs text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Avatar */

export function Avatar({ name, size = 32, className }: { name?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#e9eadf] font-semibold text-[#4b5445]",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------- Toast */

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };
type ToastInput = { tone?: ToastTone; title: string; description?: string };

const ToastContext = createContext<{ push: (toast: ToastInput) => void } | null>(null);

const toastTone: Record<ToastTone, { icon: IconName; className: string }> = {
  success: { icon: "check", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  error: { icon: "alert", className: "bg-rose-50 text-rose-700 border-rose-200" },
  info: { icon: "sparkle", className: "bg-brand-soft text-brand border-[#cfe2d6]" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = (counter.current += 1);
      setToasts((current) => [...current.slice(-3), { id, tone: toast.tone ?? "success", ...toast }]);
      window.setTimeout(() => remove(id), 4800);
    },
    [remove],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="animate-slide-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-xl"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    toastTone[toast.tone].className,
                  )}
                >
                  <Icon name={toastTone[toast.tone].icon} size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(toast.id)}
                  aria-label="Dismiss notification"
                  className="text-muted transition-colors hover:text-ink"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

/* ------------------------------------------------------------------- Misc */

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={copied ? "check" : "copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-[#f6f4ee] px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
      {children}
    </kbd>
  );
}

export function InfoRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2.5 text-[13px]", className)}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right font-medium text-ink-soft">{value ?? "—"}</span>
    </div>
  );
}

export function Money({ value, code = "USD", className }: { value: number; code?: string; className?: string }) {
  return (
    <span className={cn("num", className)}>
      {new Intl.NumberFormat("en-US", { style: "currency", currency: code || "USD" }).format(value)}
    </span>
  );
}
