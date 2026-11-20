"use client";

import { useState } from "react";

export default function CopyButton({
  value,
  label = "Copy",
  className = "btn ghost sm"
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className={className} onClick={copy} aria-label={`${label} to clipboard`}>
      {copied ? "Copied" : label}
    </button>
  );
}
