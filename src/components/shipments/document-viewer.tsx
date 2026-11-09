"use client";

import { useEffect, useRef, useState } from "react";
import type { ShipmentDocument } from "@/domain/types";
import { Button } from "@/components/ui/button";

export function DocumentViewer({
  shipmentId,
  document,
}: {
  shipmentId: string;
  document: ShipmentDocument | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const url = document ? `/api/shipments/${shipmentId}/documents/${document.id}/file` : "";

  useEffect(() => {
    if (!document || document.mimeType !== "application/pdf") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("The document could not be loaded.");
        const data = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data, disableWorkerRendering: true }).promise;
        if (cancelled) return;
        setPages(pdf.numPages);
        const pdfPage = await pdf.getPage(Math.min(page, pdf.numPages));
        const viewport = pdfPage.getViewport({ scale: 1.35 });
        const context = canvas.getContext("2d");
        if (!context || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "The document could not be previewed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [document, page, url]);

  if (!document) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a document to preview it beside the extracted fields.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <p className="truncate text-sm">{document.originalFileName}</p>
        {document.mimeType === "application/pdf" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Previous
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {page} / {pages}
            </span>
            <Button variant="outline" size="sm" type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-zinc-950 p-4">
        {loading ? (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
            Loading the document.
          </p>
        ) : null}
        {error ? (
          <div className="space-y-3 text-sm">
            <p>{error}</p>
            <a className="text-info underline" href={url} target="_blank" rel="noreferrer">
              Open the file
            </a>
          </div>
        ) : null}
        {document.mimeType === "application/pdf" ? (
          <canvas ref={canvasRef} className={error ? "hidden" : "mx-auto max-w-full bg-white"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={document.originalFileName} className="mx-auto max-h-full max-w-full" />
        )}
      </div>
    </div>
  );
}
