"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type DiscoveryPaginationProps = {
  page: number;
  pageSize: number;
  itemCount: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  label?: string;
  disabled?: boolean;
};

/** Small, keyboard-accessible pagination for bounded discovery result sets. */
export function DiscoveryPagination({
  page,
  pageSize,
  itemCount,
  hasMore,
  onPageChange,
  label = "results",
  disabled = false,
}: DiscoveryPaginationProps) {
  const start = itemCount === 0 ? 0 : page * pageSize + 1;
  const end = page * pageSize + itemCount;
  return (
    <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
      <p className="muted" aria-live="polite">
        Showing {start}–{end} {label}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost" disabled={disabled || page <= 0} onClick={() => onPageChange(Math.max(0, page - 1))} aria-label={`Previous page of ${label}`}>
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <span aria-current="page" className="muted">Page {page + 1}</span>
        <button type="button" className="btn btn-ghost" disabled={disabled || !hasMore} onClick={() => onPageChange(page + 1)} aria-label={`Next page of ${label}`}>
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
