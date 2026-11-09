"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fieldMeta } from "@/domain/fields";
import { DOCUMENT_LABEL, activityLabel } from "@/domain/labels";
import { DOCUMENT_TYPES, type AppRole, type DocumentType, type ShipmentDetail, type ShipmentField } from "@/domain/types";
import { displayValue } from "@/domain/values";
import { formatBytes, formatWhen } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
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

  const stage =
    detail.reviewStatus === "APPROVED"
      ? 3
      : detail.processingStatus === "COMPLETE" || detail.processingStatus === "MANUAL_ENTRY_REQUIRED"
        ? 2
        : detail.processingStatus === "AWAITING_DOCUMENTS"
          ? 0
          : 1;

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
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1440px] flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="font-serif text-3xl">{detail.shipmentCode}</h1>
            <p className="mt-1 text-sm text-muted">
              {detail.supplierName}, {detail.supplierCountry}
              {detail.importerName ? `, importer ${detail.importerName}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProcessingPill status={detail.processingStatus} />
            <ReviewPill status={detail.reviewStatus} />
            <span className="text-sm text-muted">
              {detail.openIssueCount === 0 ? "No open blockers" : `${detail.openIssueCount} open blocker${detail.openIssueCount === 1 ? "" : "s"}`}
            </span>
          </div>
          <ol className="flex gap-4 text-sm">
            {["Upload", "Extract", "Review", "Approve"].map((label, index) => (
              <li key={label} className={cn("border-b-2 pb-1", index === stage ? "border-accent text-ink" : "border-transparent text-muted")}>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <Button type="button" disabled={!detail.eligibility.eligible || exporting} onClick={downloadCsv}>
            {exporting ? "Preparing CSV" : "Download CSV"}
          </Button>
          {!detail.eligibility.eligible ? (
            <ul className="space-y-1 text-xs text-muted">
              {detail.eligibility.reasons.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
              {detail.eligibility.reasons.length > 4 ? <li>More reasons are listed under Checks.</li> : null}
            </ul>
          ) : (
            <p className="text-xs text-muted">This revision is approved and can be exported.</p>
          )}
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

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button
            type="button"
            variant="quiet"
            disabled={running || detail.documents.length < 3 || detail.processingStatus === "PROCESSING"}
            onClick={runExtraction}
          >
            {detail.processingStatus === "PROCESSING" ? "Reading documents" : detail.processingStatus === "FAILED" ? "Retry extraction" : "Run extraction"}
          </Button>
        ) : null}
        {detail.documents.length < 3 ? <p className="text-sm text-muted">Upload all three documents before extraction.</p> : null}
        {detail.processingStatus === "PROCESSING" ? (
          <p className="text-sm text-muted">Reading the documents. You can leave this page and come back.</p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.9fr)]">
        <DocumentViewer key={activeDocument?.id ?? "empty"} shipmentId={detail.id} document={activeDocument} />
        <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-[560px] flex-col rounded-lg border border-line bg-paper">
          <Tabs.List className="flex gap-5 border-b border-line px-4">
            {["fields", "checks", "activity"].map((value) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="border-b-2 border-transparent py-3 text-sm capitalize data-[state=active]:border-accent"
              >
                {value === "fields" ? "Fields" : value === "checks" ? "Checks" : "Activity"}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="fields" className="min-h-0 flex-1 overflow-auto p-4">
            <FieldList
              shipmentId={detail.id}
              document={activeDocument}
              fields={activeFields}
              canEdit={canEdit}
              highlighted={highlighted}
              focusKey={focusKey}
              onChanged={refresh}
            />
          </Tabs.Content>
          <Tabs.Content value="checks" className="min-h-0 flex-1 overflow-auto p-4">
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
          </Tabs.Content>
          <Tabs.Content value="activity" className="min-h-0 flex-1 overflow-auto p-4">
            <ActivityList detail={detail} />
          </Tabs.Content>
        </Tabs.Root>
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
    <div className="grid gap-3 md:grid-cols-3">
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
    <div className={cn("rounded-lg border bg-paper p-3", active ? "border-accent" : "border-line")}>
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{DOCUMENT_LABEL[type]}</span>
          {document ? <ExtractionPill status={document.extractionStatus} /> : <span className="text-xs text-muted">Missing</span>}
        </div>
        <p className="mt-2 truncate text-xs text-muted">
          {document ? `${document.originalFileName} · ${formatBytes(document.sizeBytes)}` : "PDF or image, up to 20 MB"}
        </p>
      </button>
      {document?.extractionError ? <p className="mt-2 text-xs text-bad">{document.extractionError}</p> : null}
      {document?.unreadableReason ? <p className="mt-2 text-xs text-bad">{document.unreadableReason}</p> : null}
      {progress !== null ? <p className="mt-2 text-xs text-muted">Uploading {progress}%</p> : null}
      {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
      {canEdit ? (
        <div className="mt-3">
          {document && !confirmReplace ? (
            <Button variant="quiet" type="button" onClick={() => setConfirmReplace(true)}>
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
              <span className="inline-flex rounded-md border border-line px-3.5 py-2 text-sm">{document ? "Choose replacement" : "Upload"}</span>
            </label>
          )}
          {confirmReplace ? (
            <p className="mt-2 text-xs text-muted">Replacing this file clears its extracted fields and revokes approval.</p>
          ) : null}
        </div>
      ) : null}
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
  if (!document) return <p className="text-sm text-muted">Upload this document to review its fields.</p>;
  if (fields.length === 0) {
    return <p className="text-sm text-muted">Fields appear here after extraction. Unreadable files are not marked as extracted.</p>;
  }
  const groups = ["Parties", "Invoice", "Line items", "Packing"] as const;
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const rows = fields.filter((field) => fieldMeta(field.fieldKey).group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-sm font-medium">{group}</h2>
            {rows.map((field) => (
              <FieldEditor
                key={`${field.id}:${field.reviewState}:${field.presence}:${editorValue(field)}`}
                shipmentId={shipmentId}
                field={field}
                canEdit={canEdit}
                highlighted={highlighted.has(`${field.documentType}:${field.fieldKey}`) || focusKey === field.fieldKey}
                onChanged={onChanged}
              />
            ))}
          </section>
        );
      })}
      {canEdit && document.documentType === "COMMERCIAL_INVOICE" ? (
        <Button
          variant="quiet"
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
  onChanged,
}: {
  shipmentId: string;
  field: ShipmentField;
  canEdit: boolean;
  highlighted: boolean;
  onChanged: () => Promise<ShipmentDetail>;
}) {
  const meta = fieldMeta(field.fieldKey);
  const [draft, setDraft] = useState(editorValue(field));
  const [unit, setUnit] = useState(field.value?.unit ?? "");
  const [currency, setCurrency] = useState(field.value?.currency ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const low = field.presence === "PRESENT" && field.source === "AI" && (field.confidence === null || field.confidence < 0.85) && field.reviewState === "UNREVIEWED";
  const dirty = draft !== editorValue(field) || (meta.unit && unit !== (field.value?.unit ?? "")) || (meta.money && currency !== (field.value?.currency ?? ""));

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
      className={cn(
        "rounded-md border border-line p-3",
        field.presence === "UNREADABLE" && "border-bad bg-bad-bg",
        low && "border-warn bg-warn-bg",
        highlighted && field.presence === "PRESENT" && !low && "border-bad",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{meta.label}</h3>
          <p className="mt-1 text-xs text-muted">
            {field.presence === "MISSING"
              ? "Not found in this document."
              : field.presence === "UNREADABLE"
                ? "Unreadable. Enter it from the page, or mark it as not on the document."
                : field.confidence === null
                  ? "No confidence score"
                  : field.confidence < 0.85
                    ? `Low confidence ${Math.round(field.confidence * 100)}%`
                    : `Confidence ${Math.round(field.confidence * 100)}%`}
            {field.pageNumber ? ` · Page ${field.pageNumber}` : ""}
            {field.reviewState === "CONFIRMED" ? " · Confirmed" : field.reviewState === "EDITED" ? " · Corrected" : ""}
          </p>
        </div>
      </div>
      {field.rawText ? <p className="mt-2 text-xs text-muted">Printed as {field.rawText}</p> : null}
      {field.originalValue && field.reviewState === "EDITED" ? (
        <p className="mt-1 text-xs text-muted">Extracted as {displayValue(field.originalValue)}</p>
      ) : null}
      {field.presence === "PRESENT" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
          <Input aria-label={meta.label} value={draft} disabled={!canEdit} onChange={(event) => setDraft(event.target.value)} />
          {meta.unit ? (
            <Input aria-label={`${meta.label} unit`} value={unit} disabled={!canEdit} placeholder="Unit" onChange={(event) => setUnit(event.target.value)} />
          ) : null}
          {meta.money ? (
            <Input aria-label={`${meta.label} currency`} value={currency} disabled={!canEdit} placeholder="Currency" onChange={(event) => setCurrency(event.target.value)} />
          ) : null}
        </div>
      ) : canEdit ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <Input aria-label={meta.label} value={draft} placeholder="Enter the value" onChange={(event) => setDraft(event.target.value)} />
          {meta.unit ? <Input aria-label={`${meta.label} unit`} value={unit} placeholder="Unit" onChange={(event) => setUnit(event.target.value)} /> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm">No value</p>
      )}
      {canEdit ? (
        <div className="mt-3 space-y-2">
          <TextArea aria-label="Note" value={note} placeholder="Note for the history, optional" onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            {field.presence === "PRESENT" ? (
              <>
                <Button
                  type="button"
                  variant="quiet"
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
                  variant="quiet"
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
                    variant="quiet"
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
      {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
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
    <div className="space-y-4">
      {ordered.length === 0 ? <p className="text-sm text-muted">Cross-checks appear after extraction.</p> : null}
      {ordered.map((issue) => (
        <article key={issue.id} className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <ResultPill result={issue.result} />
          </div>
          <p className="mt-2 text-sm">{issue.message}</p>
          {issue.evidence.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {issue.evidence.map((item, index) => (
                <li key={`${item.documentType}-${item.fieldKey}-${index}`}>
                  {item.documentType !== "SHIPMENT" && DOCUMENT_TYPES.includes(item.documentType as DocumentType) ? (
                    <button
                      type="button"
                      className="text-left text-xs text-accent underline"
                      onClick={() => onShow(item.documentType as DocumentType, item.fieldKey)}
                    >
                      {DOCUMENT_LABEL[item.documentType as DocumentType]}
                      {item.value ? `: ${item.value}${item.unit ? ` ${item.unit}` : ""}` : ""}
                    </button>
                  ) : (
                    <span className="text-xs text-muted">
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
        <ul className="space-y-1 text-xs text-muted">
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
  if (detail.activity.length === 0) return <p className="text-sm text-muted">No activity yet.</p>;
  return (
    <ol className="space-y-4">
      {detail.activity.map((event) => (
        <li key={event.id} className="border-b border-line pb-3">
          <p className="text-sm">{activityLabel(event.type, event.payload)}</p>
          <p className="mt-1 text-xs text-muted">
            {formatWhen(event.createdAt)}
            {event.actorName ? ` · ${event.actorName}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
