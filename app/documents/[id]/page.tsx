"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, TriangleAlert } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  ExtractionPanel,
  type ExtractionData,
} from "@/components/extraction/extraction-panel";

type PageData = {
  document: {
    id: string;
    fileName: string;
    emailSubject: string;
    status: string;
    createdAt: string;
    messageId: string;
  };
  extraction: ExtractionData;
};

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) {
      setLoadError(res.status === 404 ? "Document not found." : "Failed to load document.");
      return;
    }
    setData((await res.json()) as PageData);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Loading document…</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5">
          <TriangleAlert className="size-5 text-destructive" />
        </div>
        <div>
          <p className="font-medium text-foreground">Something went wrong</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError ?? "Failed to load this document."}</p>
        </div>
        <Link
          href="/mail"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" />
          Back to inbox
        </Link>
      </div>
    );
  }

  const { document } = data;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Link
          href={document.messageId ? `/email/${document.messageId}` : "/mail"}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Back"
        >
          <ArrowLeft className="size-4" />
        </Link>

        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <FileText className="size-3.5 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold leading-tight text-foreground">
            {document.fileName}
          </h1>
          {document.emailSubject && (
            <p className="truncate text-xs text-muted-foreground">{document.emailSubject}</p>
          )}
        </div>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Left — PDF viewer */}
        <ResizablePanel defaultSize={58} minSize={40} className="bg-muted/10">
          <iframe
            key={page}
            src={`/api/documents/${id}/file#page=${page}`}
            className="h-full w-full"
            title="Original PDF"
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right — extraction panel */}
        <ResizablePanel defaultSize={42} minSize={30} className="flex min-w-0 flex-col bg-background">
          <ExtractionPanel
            documentId={document.id}
            initialStatus={document.status}
            initialExtraction={data.extraction}
            onActivePage={setPage}
            onChange={load}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
