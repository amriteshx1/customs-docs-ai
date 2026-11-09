"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fieldMeta } from "@/domain/fields";
import { DOCUMENT_LABEL, activityLabel } from "@/domain/labels";
import { DOCUMENT_TYPES, type AppRole, type DocumentType, type ShipmentDetail, type ShipmentField } from "@/domain/types";
import { displayValue } from "@/domain/values";
import { cn, formatBytes, formatWhen } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input, TextArea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentViewer } from "@/components/shipments/document-viewer";
import { ExtractionPill, ProcessingPill, ResultPill, ReviewPill } from "@/components/shipments/status-pill";

class ApiError extends Error {
  reasons: string[];
  constructor(message: string, reasons: string[] = []) {
    super(message);
    this.reasons = reasons;
  }
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || "The request failed.", data.reasons || []);
  }
  return data as T;
}

function editorValue(field: ShipmentField) {
  if (!field.value) return "";
  if (field.value.kind === "string") return field.value.text ?? "";
  if (field.value.kind === "number") return field.value.number ?? "";
  return (field.value.list ?? []).join(", ");
}

function isLowConfidence(field: ShipmentField) {
  return (
    field.presence === "PRESENT" &&
    field.source === "AI" &&
    (field.confidence === null || field.confidence < 0.85) &&
    field.reviewState === "UNREVIEWED"
  );
}

function fieldState(field: ShipmentField) {
  if (field.presence === "MISSING") return { label: "Missing", tone: "warn" as const };
  if (field.presence === "UNREADABLE") return { label: "Unreadable", tone: "bad" as const };
  if (field.reviewState === "CONFIRMED") return { label: "Confirmed", tone: "ok" as const };
  if (field.reviewState === "EDITED") return { label: "Corrected", tone: "info" as const };
  if (isLowConfidence(field)) return { label: "Low confidence", tone: "warn" as const };
  return { label: "Unreviewed", tone: "default" as const };
}

export function ShipmentWorkspace({ initial, role }: { initial: ShipmentDetail; role: AppRole }) {
  const [detail, setDetail] = useState(initial);
  const [activeType, setActiveType] = useState<DocumentType>(DOCUMENT_TYPES[0]);
  const [tab, setTab] = useState("fields");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canEdit = role === "DOCUMENTATION_EXECUTIVE";

  async function refresh() {
    const next = await apiJson<ShipmentDetail>(`/api/shipments/${detail.id}`);
    setDetail(next);
    return next;
  }

  useEffect(() => {
    if (detail.processingStatus !== "PROCESSING") return;
    const shipmentId = detail.id;
    const timer = window.setInterval(() => {
      apiJson<ShipmentDetail>(`/api/shipments/${shipmentId}`)
        .then((next) => {
          setDetail(next);
          if (next.processingStatus !== "PROCESSING") {
            toast(next.processingStatus === "FAILED" ? "Extraction needs attention." : "Extraction finished.");
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [detail.id, detail.processingStatus]);

  const activeDocument = detail.documents.find((document) => document.documentType === activeType) ?? null;
  const activeFields = detail.fields.filter((field) => field.documentType === activeType);
  const highlighted = useMemo(() => {
    const keys = new Set<string>();
    for (const issue of detail.issues) {
      if (issue.state !== "OPEN" || (issue.result !== "MISMATCH" && issue.result !== "NEEDS_REVIEW")) continue;
      for (const item of issue.evidence) keys.add(`${item.documentType}:${item.fieldKey}`);
    }
    return keys;
  }, [detail.issues]);

  async function runExtraction() {
    setRunning(true);
    try {
      const response = await fetch(`/api/shipments/${detail.id}/extract`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(data.error || "Extraction could not start.", data.reasons || []);
      toast("Extraction started.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Extraction could not start.");
    } finally {
      setRunning(false);
    }
  }

  async function downloadCsv() {
    setExporting(true);
    try {
      const response = await fetch(`/api/shipments/${detail.id}/export`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(data.error || "Export is not available.", data.reasons || []);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "");
      link.href = url;
      link.download = match?.[1] || `${detail.shipmentCode}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden px-6 py-3">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight tabular-nums">{detail.shipmentCode}</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {detail.supplierName} · {detail.supplierCountry}
            {detail.importerName ? ` · ${detail.importerName}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProcessingPill status={detail.processingStatus} />
            <ReviewPill status={detail.reviewStatus} />
            <span className="text-xs text-muted-foreground">
              {detail.openIssueCount === 0
                ? "No open blockers"
                : `${detail.openIssueCount} open blocker${detail.openIssueCount === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button type="button" disabled={!detail.eligibility.eligible || exporting} onClick={downloadCsv}>
            {exporting ? "Preparing CSV" : "Download CSV"}
          </Button>
          {!detail.eligibility.eligible ? (
            <ul className="max-w-xs space-y-1 text-right text-xs text-muted-foreground">
              {detail.eligibility.reasons.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
              {detail.eligibility.reasons.length > 4 ? <li>More reasons are listed under Checks.</li> : null}
            </ul>
          ) : null}
        </div>
      </div>

      <DocumentStrip
        detail={detail}
        activeType={activeType}
        canEdit={canEdit}
        onSelect={(type) => {
          setActiveType(type);
          setTab("fields");
        }}
        onUploaded={refresh}
      />

      <div className="mb-3 mt-3 flex shrink-0 flex-wrap items-center gap-3">
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={running || detail.documents.length < 3 || detail.processingStatus === "PROCESSING"}
            onClick={runExtraction}
          >
            {detail.processingStatus === "PROCESSING" ? "Reading documents" : detail.processingStatus === "FAILED" ? "Retry extraction" : "Run extraction"}
          </Button>
        ) : null}
        {detail.documents.length < 3 ? <p className="text-sm text-muted-foreground">Upload all three documents before extraction.</p> : null}
        {detail.processingStatus === "PROCESSING" ? (
          <p className="text-sm text-muted-foreground">Reading the documents. You can leave this page and come back.</p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(380px,46%)_minmax(0,1fr)] gap-4">
        <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <TabsList className="w-full shrink-0 justify-start">
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="checks">Checks</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="fields" className="min-h-0 flex-1 overflow-y-auto p-3">
            <FieldList
              shipmentId={detail.id}
              document={activeDocument}
              fields={activeFields}
              canEdit={canEdit}
              highlighted={highlighted}
              focusKey={focusKey}
              onChanged={refresh}
            />
          </TabsContent>
          <TabsContent value="checks" className="min-h-0 flex-1 overflow-y-auto p-3">
            <Checks
              detail={detail}
              canEdit={canEdit}
              role={role}
              onShow={(type, fieldKey) => {
                setActiveType(type);
                setFocusKey(fieldKey);
                setTab("fields");
              }}
              onChanged={refresh}
            />
          </TabsContent>
          <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto p-3">
            <ActivityList detail={detail} />
          </TabsContent>
        </Tabs>
        <div className="h-full min-h-0">
          <DocumentViewer key={activeDocument?.id ?? "empty"} shipmentId={detail.id} document={activeDocument} />
        </div>
      </div>
    </div>
  );
}

function DocumentStrip({
  detail,
  activeType,
  canEdit,
  onSelect,
  onUploaded,
}: {
  detail: ShipmentDetail;
  activeType: DocumentType;
  canEdit: boolean;
  onSelect: (type: DocumentType) => void;
  onUploaded: () => Promise<ShipmentDetail>;
}) {
  return (
    <div className="grid shrink-0 gap-2 md:grid-cols-3">
      {DOCUMENT_TYPES.map((type) => {
        const document = detail.documents.find((item) => item.documentType === type);
        return (
          <UploadSlot
            key={type}
            shipmentId={detail.id}
            type={type}
            document={document}
            active={activeType === type}
            canEdit={canEdit}
            onSelect={() => onSelect(type)}
            onUploaded={onUploaded}
          />
        );
      })}
    </div>
  );
}

function UploadSlot({
  shipmentId,
  type,
  document,
  active,
  canEdit,
  onSelect,
  onUploaded,
}: {
  shipmentId: string;
  type: DocumentType;
  document: ShipmentDetail["documents"][number] | undefined;
  active: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onUploaded: () => Promise<ShipmentDetail>;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  function send(file: File) {
    setError(null);
    setProgress(0);
    const body = new FormData();
    body.set("documentType", type);
    body.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/shipments/${shipmentId}/documents`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(`${DOCUMENT_LABEL[type]} uploaded.`);
        onUploaded().catch(() => undefined);
        return;
      }
      const data = JSON.parse(xhr.responseText || "{}");
      setError(data.error || "Upload failed.");
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed.");
    };
    xhr.send(body);
  }

  return (
    <div
      className={cn(
        "relative rounded-md border bg-card px-3 py-2 transition-colors",
        active ? "border-foreground/40 bg-accent/50" : "border-border hover:border-foreground/25 hover:bg-accent/30",
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={`Select ${DOCUMENT_LABEL[type]}`}
        onClick={onSelect}
        className="absolute inset-0 z-0 cursor-pointer rounded-md"
      />
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium leading-tight">{DOCUMENT_LABEL[type]}</span>
          {document ? (
            <span className="shrink-0">
              <ExtractionPill status={document.extractionStatus} />
            </span>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">Missing</span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {document ? `${document.originalFileName} · ${formatBytes(document.sizeBytes)}` : "PDF or image, up to 20 MB"}
        </p>
        {document?.extractionError ? <p className="mt-1.5 text-xs text-bad">{document.extractionError}</p> : null}
        {document?.unreadableReason ? <p className="mt-1.5 text-xs text-bad">{document.unreadableReason}</p> : null}
        {progress !== null ? <p className="mt-1.5 text-xs text-muted-foreground">Uploading {progress}%</p> : null}
        {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : null}
        {canEdit ? (
          <div className="pointer-events-auto mt-2 w-fit">
            {document && !confirmReplace ? (
              <Button variant="outline" size="sm" type="button" onClick={() => setConfirmReplace(true)}>
                Replace
              </Button>
            ) : (
              <label className="inline-flex cursor-pointer">
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setConfirmReplace(false);
                    send(file);
                  }}
                />
                <span className="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm hover:bg-accent">
                  {document ? "Choose replacement" : "Upload"}
                </span>
              </label>
            )}
            {confirmReplace ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Replacing this file clears its extracted fields and revokes approval.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FieldList({
  shipmentId,
  document,
  fields,
  canEdit,
  highlighted,
  focusKey,
  onChanged,
}: {
  shipmentId: string;
  document: ShipmentDetail["documents"][number] | null;
  fields: ShipmentField[];
  canEdit: boolean;
  highlighted: Set<string>;
  focusKey: string | null;
  onChanged: () => Promise<ShipmentDetail>;
}) {
  const [adding, setAdding] = useState(false);
  if (!document) return <p className="text-sm text-muted-foreground">Upload this document to review its fields.</p>;
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">Fields appear here after extraction. Unreadable files are not marked as extracted.</p>;
  }
  const groups = ["Parties", "Invoice", "Line items", "Packing"] as const;
  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const rows = fields.filter((field) => fieldMeta(field.fieldKey).group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="space-y-1.5">
            <h2 className="px-1 text-xs font-medium text-muted-foreground">{group}</h2>
            {rows.map((field) => (
              <FieldEditor
                key={`${field.id}:${field.reviewState}:${field.presence}:${editorValue(field)}`}
                shipmentId={shipmentId}
                field={field}
                canEdit={canEdit}
                highlighted={highlighted.has(`${field.documentType}:${field.fieldKey}`)}
                focused={focusKey === field.fieldKey}
                onChanged={onChanged}
              />
            ))}
          </section>
        );
      })}
      {canEdit && document.documentType === "COMMERCIAL_INVOICE" ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={adding}
          onClick={async () => {
            setAdding(true);
            try {
              await apiJson(`/api/shipments/${shipmentId}/manual-fields`, {
                method: "POST",
                body: JSON.stringify({ action: "add-line", documentId: document.id }),
              });
              await onChanged();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "The line could not be added.");
            } finally {
              setAdding(false);
            }
          }}
        >
          {adding ? "Adding line" : "Add line"}
        </Button>
      ) : null}
    </div>
  );
}

function FieldEditor({
  shipmentId,
  field,
  canEdit,
  highlighted,
  focused,
  onChanged,
}: {
  shipmentId: string;
  field: ShipmentField;
  canEdit: boolean;
  highlighted: boolean;
  focused: boolean;
  onChanged: () => Promise<ShipmentDetail>;
}) {
  const meta = fieldMeta(field.fieldKey);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(editorValue(field));
  const [unit, setUnit] = useState(field.value?.unit ?? "");
  const [currency, setCurrency] = useState(field.value?.currency ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const low = isLowConfidence(field);
  const dirty = draft !== editorValue(field) || (meta.unit && unit !== (field.value?.unit ?? "")) || (meta.money && currency !== (field.value?.currency ?? ""));
  const state = fieldState(field);
  const valueText = displayValue(field.value) || "—";
  const needsAttention = field.presence !== "PRESENT" || low || highlighted;
  const attentionTone = field.presence === "UNREADABLE" || (highlighted && field.presence === "PRESENT") ? "bad" : low || field.presence === "MISSING" ? "warn" : null;

  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  async function send(url: string, body: unknown, success: string) {
    setPending(success);
    setError(null);
    try {
      await apiJson(url, { method: url.endsWith("/confirm") ? "POST" : body && (body as { action?: string }).action ? "POST" : "PATCH", body: JSON.stringify(body) });
      toast.success(success);
      setNote("");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The field could not be saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "rounded-md border border-border bg-background/40",
        needsAttention && attentionTone === "bad" && "border-l-2 border-l-bad",
        needsAttention && attentionTone === "warn" && "border-l-2 border-l-warn",
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="grid w-full grid-cols-[auto_minmax(7rem,32%)_minmax(0,1fr)_2.5rem_auto] items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/40"
          >
            <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
            <span className="truncate text-sm font-medium">{meta.label}</span>
            <span className="truncate text-sm text-muted-foreground">{valueText}</span>
            <span className={cn("text-right text-[11px] tabular-nums", low ? "text-warn" : "text-muted-foreground")}>
              {field.confidence !== null ? `${Math.round(field.confidence * 100)}%` : ""}
            </span>
            <Badge variant={state.tone}>{state.label}</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t border-border px-3 py-3">
            {field.rawText ? <p className="text-xs text-muted-foreground">Printed as {field.rawText}</p> : null}
            {field.originalValue && field.reviewState === "EDITED" ? (
              <p className="text-xs text-muted-foreground">Extracted as {displayValue(field.originalValue)}</p>
            ) : null}
            {field.pageNumber ? <p className="text-xs text-muted-foreground">Page {field.pageNumber}</p> : null}
            {field.presence === "UNREADABLE" ? (
              <p className="text-xs text-bad">Unreadable. Enter it from the page, or mark it as not on the document.</p>
            ) : null}
            {field.presence === "MISSING" ? <p className="text-xs text-muted-foreground">Not found in this document.</p> : null}
            {field.presence === "PRESENT" ? (
              <div className={cn("grid gap-2", (meta.unit || meta.money) && "sm:grid-cols-[minmax(0,1fr)_7rem_7rem]")}>
                <Input aria-label={meta.label} value={draft} disabled={!canEdit} onChange={(event) => setDraft(event.target.value)} />
                {meta.unit ? (
                  <Input aria-label={`${meta.label} unit`} value={unit} disabled={!canEdit} placeholder="Unit" onChange={(event) => setUnit(event.target.value)} />
                ) : null}
                {meta.money ? (
                  <Input aria-label={`${meta.label} currency`} value={currency} disabled={!canEdit} placeholder="Currency" onChange={(event) => setCurrency(event.target.value)} />
                ) : null}
              </div>
            ) : canEdit ? (
              <div className={cn("grid gap-2", meta.unit && "sm:grid-cols-[minmax(0,1fr)_7rem]")}>
                <Input aria-label={meta.label} value={draft} placeholder="Enter the value" onChange={(event) => setDraft(event.target.value)} />
                {meta.unit ? <Input aria-label={`${meta.label} unit`} value={unit} placeholder="Unit" onChange={(event) => setUnit(event.target.value)} /> : null}
              </div>
            ) : (
              <p className="text-sm">No value</p>
            )}
            {canEdit ? (
              <div className="space-y-2">
                <TextArea
                  className="min-h-16"
                  aria-label="Note"
                  value={note}
                  placeholder="Note for the history, optional"
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {field.presence === "PRESENT" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!dirty || pending !== null}
                        onClick={() =>
                          send(
                            `/api/shipments/${shipmentId}/fields/${field.id}`,
                            { value: draft, unit, currency, note },
                            "Correction saved.",
                          )
                        }
                      >
                        {pending === "Correction saved." ? "Saving correction" : "Save correction"}
                      </Button>
                      <Button
                        type="button"
                        disabled={dirty || field.reviewState !== "UNREVIEWED" || pending !== null}
                        onClick={() => send(`/api/shipments/${shipmentId}/fields/${field.id}/confirm`, { note }, "Value confirmed.")}
                      >
                        {pending === "Value confirmed." ? "Confirming" : "Confirm value"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        disabled={!draft.trim() || pending !== null}
                        onClick={() =>
                          send(
                            `/api/shipments/${shipmentId}/manual-fields`,
                            { action: "save", fieldId: field.id, presence: "present", value: draft, unit, currency, note },
                            "Value entered.",
                          )
                        }
                      >
                        Save entered value
                      </Button>
                      {field.presence === "UNREADABLE" ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pending !== null}
                          onClick={() =>
                            send(
                              `/api/shipments/${shipmentId}/manual-fields`,
                              { action: "save", fieldId: field.id, presence: "missing", note },
                              "Marked as not on the document.",
                            )
                          }
                        >
                          Not on this document
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}
            {error ? <p className="text-xs text-bad">{error}</p> : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function Checks({
  detail,
  canEdit,
  role,
  onShow,
  onChanged,
}: {
  detail: ShipmentDetail;
  canEdit: boolean;
  role: AppRole;
  onShow: (type: DocumentType, fieldKey: string) => void;
  onChanged: () => Promise<ShipmentDetail>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ordered = [...detail.issues].sort((left, right) => {
    const rank = { MISMATCH: 0, NEEDS_REVIEW: 1, WARNING: 2, PASS: 3 };
    return rank[left.result] - rank[right.result];
  });

  async function act(url: string, success: string) {
    setPending(success);
    setError(null);
    try {
      await apiJson(url, { method: "POST", body: JSON.stringify({}) });
      toast.success(success);
      await onChanged();
    } catch (caught) {
      if (caught instanceof ApiError && caught.reasons.length) setError(caught.reasons.join(" "));
      else setError(caught instanceof Error ? caught.message : "The action failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {ordered.length === 0 ? <p className="text-sm text-muted-foreground">Cross-checks appear after extraction.</p> : null}
      {ordered.map((issue) => (
        <article key={issue.id} className="rounded-md border border-border p-3">
          <ResultPill result={issue.result} />
          <p className="mt-2 text-sm">{issue.message}</p>
          {issue.evidence.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {issue.evidence.map((item, index) => (
                <li key={`${item.documentType}-${item.fieldKey}-${index}`}>
                  {item.documentType !== "SHIPMENT" && DOCUMENT_TYPES.includes(item.documentType as DocumentType) ? (
                    <button
                      type="button"
                      className="text-left text-xs text-info hover:underline"
                      onClick={() => onShow(item.documentType as DocumentType, item.fieldKey)}
                    >
                      {DOCUMENT_LABEL[item.documentType as DocumentType]}
                      {item.value ? `: ${item.value}${item.unit ? ` ${item.unit}` : ""}` : ""}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Shipment record{item.value ? `: ${item.value}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
      {canEdit ? (
        <Button type="button" disabled={!detail.submitEligibility.eligible || pending !== null} onClick={() => act(`/api/shipments/${detail.id}/submit`, "Submitted for approval.")}>
          {pending === "Submitted for approval." ? "Submitting" : "Submit for approval"}
        </Button>
      ) : null}
      {role === "DOCUMENTATION_MANAGER" ? (
        <Button
          type="button"
          disabled={detail.reviewStatus !== "PENDING_APPROVAL" || pending !== null}
          onClick={() => act(`/api/shipments/${detail.id}/approval`, "Shipment approved.")}
        >
          {pending === "Shipment approved." ? "Approving" : "Approve shipment"}
        </Button>
      ) : null}
      {!detail.submitEligibility.eligible && canEdit ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {detail.submitEligibility.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}

function ActivityList({ detail }: { detail: ShipmentDetail }) {
  if (detail.activity.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-3">
      {detail.activity.map((event) => (
        <li key={event.id} className="border-b border-border pb-3 last:border-0">
          <p className="text-sm">{activityLabel(event.type, event.payload)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatWhen(event.createdAt)}
            {event.actorName ? ` · ${event.actorName}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
