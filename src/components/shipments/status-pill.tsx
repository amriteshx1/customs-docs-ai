import type { ReactNode } from "react";
import { EXTRACTION_LABEL, PROCESSING_LABEL, RESULT_LABEL, REVIEW_LABEL } from "@/domain/labels";
import type { ExtractionStatus, ProcessingStatus, ReviewStatus, ValidationResult } from "@/domain/types";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-desk text-ink",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  accent: "bg-accent/10 text-accent",
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function ProcessingPill({ status }: { status: ProcessingStatus }) {
  const tone = status === "COMPLETE" ? "ok" : status === "FAILED" || status === "MANUAL_ENTRY_REQUIRED" ? "bad" : status === "PROCESSING" ? "accent" : "neutral";
  return <StatusPill tone={tone}>{PROCESSING_LABEL[status]}</StatusPill>;
}

export function ReviewPill({ status }: { status: ReviewStatus }) {
  const tone = status === "APPROVED" ? "ok" : status === "PENDING_APPROVAL" ? "warn" : status === "IN_REVIEW" ? "accent" : "neutral";
  return <StatusPill tone={tone}>{REVIEW_LABEL[status]}</StatusPill>;
}

export function ExtractionPill({ status }: { status: ExtractionStatus }) {
  const tone =
    status === "EXTRACTED" || status === "MANUALLY_COMPLETED"
      ? "ok"
      : status === "FAILED" || status === "UNREADABLE"
        ? "bad"
        : status === "PARTIAL"
          ? "warn"
          : status === "PROCESSING"
            ? "accent"
            : "neutral";
  return <StatusPill tone={tone}>{EXTRACTION_LABEL[status]}</StatusPill>;
}

export function ResultPill({ result }: { result: ValidationResult }) {
  const tone = result === "PASS" ? "ok" : result === "WARNING" ? "warn" : "bad";
  return <StatusPill tone={tone}>{RESULT_LABEL[result]}</StatusPill>;
}
