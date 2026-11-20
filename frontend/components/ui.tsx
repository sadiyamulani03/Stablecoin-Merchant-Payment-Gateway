import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  flush = false,
  ...rest
}: { children: ReactNode; className?: string; flush?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card${flush ? " flush" : ""}${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="stack-sm">
        <h2>{title}</h2>
        {description ? <p className="muted small">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export type BadgeTone = "success" | "pending" | "danger" | "info" | "neutral";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Alert({
  tone = "warning",
  title,
  children
}: {
  tone?: "warning" | "info" | "success" | "danger";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`alert ${tone === "warning" ? "" : tone}`.trim()} role={tone === "danger" ? "alert" : "status"}>
      <div>
        {title ? <div className="alert-title">{title}</div> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <span className="field-error" id={`${htmlFor}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint" id={`${htmlFor}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function SkeletonLines({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="skeleton skeleton-line"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <div className="empty-title">{title}</div>
      {description ? <p className="empty-text">{description}</p> : null}
      {action}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="kv">
      {items.map((item) => (
        <div className="kv-row" key={item.label}>
          <span className="kv-key">{item.label}</span>
          <span className="kv-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function StepList({ steps }: { steps: { label: string; state: "todo" | "active" | "done" }[] }) {
  return (
    <ol className="steps" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((step) => (
        <li className={`step ${step.state === "todo" ? "" : step.state}`.trim()} key={step.label}>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
