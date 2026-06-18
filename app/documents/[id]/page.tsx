"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  FileText,
  Clock,
  Cpu,
  TriangleAlert,
  RefreshCw,
  Send,
  Check,
} from "lucide-react";
import { EXTRACTION_MODELS, type ExtractionModelKey } from "@/lib/extractor";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Types ─────────────────────────────────────────────────────────────────

type ExtractedField = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  confidence: number;
  page?: number;
  fieldType?: string;
};

type ExtractionResult = {
  documentType: string;
  overallConfidence: number;
  fields: ExtractedField[];
};

type PageData = {
  document: {
    id: string;
    fileName: string;
    emailSubject: string;
    status: string;
    createdAt: string;
  };
  extraction: {
    id: string;
    confidence: number;
    createdAt: string;
    extractedJson: string;
    model?: string;
    processingTime?: number;
  } | null;
};

type SectionDef = {
  id: string;
  title: string;
  defaultExpanded: boolean;
};

type FilterType = "all" | "needs-review" | "empty" | "low-confidence";

// ─── Section definitions ────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  { id: "loan",          title: "Loan Information",             defaultExpanded: true  },
  { id: "applicant",     title: "Applicant Information",        defaultExpanded: true  },
  { id: "coapplicant",   title: "Co-Applicant Information",     defaultExpanded: false },
  { id: "residence",     title: "Residence Information",        defaultExpanded: false },
  { id: "employment",    title: "Employment Information",       defaultExpanded: true  },
  { id: "income",        title: "Income Sources",               defaultExpanded: false },
  { id: "assets",        title: "Assets",                       defaultExpanded: false },
  { id: "debts",         title: "Debts & Obligations",          defaultExpanded: false },
  { id: "questionnaire", title: "Questionnaire / Eligibility",  defaultExpanded: false },
  { id: "signatures",    title: "Signatures & Declarations",    defaultExpanded: false },
];

// Ordered most-specific first so co-applicant matches before applicant, etc.
const MATCHERS: [string, RegExp][] = [
  ["signatures",    /signatur|sign\s*date|certif|acknowledg|declar/i],
  ["questionnaire", /judgment|lawsuit|bankrupt|foreclos|delinquen|citizen|primary\s*resid|ownership\s*interest|borrowed\s*down|endorser|co[-\s]?maker/i],
  ["coapplicant",   /co[-.\s]?applicant|co[-.\s]?borrower|coborrower|joint\s*applicant/i],
  ["assets",        /\basset|checking\s*acc|savings\s*acc|retirement|401k|\bira\b|keogh|\bstock|\bbond|life\s*insur|real\s*estate\s*own|automobile|\bvehicle|cash\s*value/i],
  ["debts",         /liabilit|creditor|unpaid\s*balance|monthly\s*pay|credit\s*card|student\s*loan|car\s*loan|alimony|child\s*support/i],
  ["income",        /base\s*employ|overtime|\bbonus|commission|dividend|net\s*rental|\bpension\b|\bssi\b|social\s*sec.*income|other\s*income|total\s*income/i],
  ["employment",    /employ|occupation|\bposition\b|\btitle\b|self[-\s]employ|business\s*name|business\s*type|years.*job|yrs.*employ/i],
  ["residence",     /present\s*addr|mailing\s*addr|former\s*addr|previous\s*addr|current\s*addr|own\s*or\s*rent|homeowner|housing\s*exp|rent\s*pay|\bcounty\b|\bzip\b/i],
  ["loan",          /loan\s*purpose|loan\s*amount|loan\s*type|property\s*type|down\s*pay|purchase\s*price|appraised|subject\s*prop|sales\s*price|\bseller\b|refinanc|construc|agency\s*case|ltv\b/i],
  ["applicant",     /borrower|applicant|full\s*name|first\s*name|last\s*name|middle\s*name|\bssn\b|social\s*sec|date\s*of\s*birth|\bdob\b|marital|dependent/i],
];

// ─── Pure helpers ───────────────────────────────────────────────────────────

function assignSection(f: ExtractedField): string {
  const text = `${f.key} ${f.label}`;
  for (const [id, re] of MATCHERS) if (re.test(text)) return id;
  return "other";
}

function fieldIsEmpty(f: ExtractedField): boolean {
  return f.value === null || f.value === undefined || String(f.value).trim() === "";
}

function applyFilter(
  fields: ExtractedField[],
  filter: FilterType,
  showEmpty: boolean
): ExtractedField[] {
  switch (filter) {
    case "needs-review":   return fields.filter(f => f.confidence < 0.85 && !fieldIsEmpty(f));
    case "empty":          return fields.filter(fieldIsEmpty);
    case "low-confidence": return fields.filter(f => f.confidence < 0.60);
    default:               return showEmpty ? fields : fields.filter(f => !fieldIsEmpty(f));
  }
}

function avg(fields: ExtractedField[]): number {
  if (!fields.length) return 1;
  return fields.reduce((s, f) => s + f.confidence, 0) / fields.length;
}

function findFieldValue(
  fields: ExtractedField[],
  pattern: RegExp,
  exclude?: RegExp
): string {
  const f = fields.find(f => {
    const t = `${f.key} ${f.label}`;
    if (exclude?.test(t)) return false;
    return pattern.test(t) && !fieldIsEmpty(f);
  });
  return f ? String(f.value) : "—";
}

// ─── UI primitives ─────────────────────────────────────────────────────────

function confidenceClasses(score: number): string {
  return score >= 0.85
    ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20"
    : score >= 0.6
    ? "text-amber-700 bg-amber-50 ring-amber-600/20"
    : "text-red-700 bg-red-50 ring-red-600/20";
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset ${confidenceClasses(score)}`}>
      {pct}%
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();

  // — Existing state (untouched) —
  const [data, setData]             = useState<PageData | null>(null);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [edits, setEdits]           = useState<Record<string, string>>({});

  // — Panel state —
  const [filter, setFilter] = useState<FilterType>("all");
  const [showEmpty, setShowEmpty] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(SECTIONS.filter(s => !s.defaultExpanded).map(s => s.id))
  );
  const [selectedModel, setSelectedModel] = useState<ExtractionModelKey>("gemini");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Expand all sections when a filter is active so results are visible
  useEffect(() => {
    if (filter !== "all") setCollapsedSections(new Set());
  }, [filter]);

  // — Existing callbacks (untouched) —
  const loadData = useCallback(async () => {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) {
      setLoadError(res.status === 404 ? "Document not found." : "Failed to load document.");
      return;
    }
    const d = (await res.json()) as PageData;
    setData(d);
    if (d.extraction) {
      const parsed = JSON.parse(d.extraction.extractedJson) as ExtractionResult;
      const init: Record<string, string> = {};
      for (const f of parsed.fields) init[f.key] = f.value === null ? "" : String(f.value);
      setEdits(init);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const runExtraction = useCallback(async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/documents/${id}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      if (!res.ok) { setExtractError(await res.text()); return; }
      await loadData();
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, [id, selectedModel, loadData]);

  const saveEdits = useCallback(async () => {
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      const res = await fetch(`/api/documents/${id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [id, edits]);

  function toggleSection(id: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function jumpToSection(sid: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.delete(sid);
      return next;
    });
    requestAnimationFrame(() => {
      window.document.getElementById(`sec-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Keyboard shortcut: ⌘/Ctrl+S to save corrections (only when extracted)
  const isExtracted = data?.document.status === "extracted";
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (isExtracted && !saving) {
          e.preventDefault();
          saveEdits();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isExtracted, saving, saveEdits]);

  // ── Early returns ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{loadError ?? "Something went wrong."}</p>
        <Link href="/mail" className="text-sm font-medium underline-offset-4 hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const { document, extraction } = data;
  const isFailed    = document.status === "failed";

  const parsed: ExtractionResult | null = extraction
    ? (JSON.parse(extraction.extractedJson) as ExtractionResult)
    : null;

  // Build section map
  const fieldsBySection: Record<string, ExtractedField[]> = {};
  SECTIONS.forEach(s => { fieldsBySection[s.id] = []; });
  fieldsBySection["other"] = [];
  if (parsed) {
    for (const f of parsed.fields) {
      const sid = assignSection(f);
      (fieldsBySection[sid] ??= []).push(f);
    }
  }

  const allFields = parsed?.fields ?? [];
  const needsReviewTotal = allFields.filter(f => f.confidence < 0.85 && !fieldIsEmpty(f)).length;
  const emptyTotal       = allFields.filter(fieldIsEmpty).length;
  const lowConfTotal     = allFields.filter(f => f.confidence < 0.60).length;

  // Summary values
  // Pick a person-name field — exclude email/address/contact/identifier fields so we
  // never grab "Applicant Email Address" (which also matches /applicant/) instead of the name.
  const CONTACT_EXCLUDE = /email|e-mail|address|phone|relative|landlord|mortgage|seller|employer|business|manufacturer|ssn|social|birth|\bdob\b|marital|\bsex\b|depend/i;
  const applicantName   = findFieldValue(
    allFields,
    /full\s*name|(?:applicant|borrower).*name/i,
    new RegExp(`co[-.\\s]?applicant|coapplicant|co[-.\\s]?borrower|coborrower|${CONTACT_EXCLUDE.source}`, "i")
  );
  const coApplicantName = findFieldValue(
    allFields,
    /co[-.\s]?(?:borrower|applicant)/i,
    CONTACT_EXCLUDE
  );
  const propertyAddr    = findFieldValue(allFields, /subject\s*prop|property\s*addr|propert.*street/i);
  const activeSections  = SECTIONS.filter(s => (fieldsBySection[s.id]?.length ?? 0) > 0).length;

  // Extraction run metadata
  const currentModelKey = (extraction?.model ?? "gemini") as ExtractionModelKey;
  const currentModelLabel = EXTRACTION_MODELS[currentModelKey]?.label ?? extraction?.model ?? "Unknown";
  const extractionDate = extraction?.createdAt
    ? new Date(extraction.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const processingTimeSec = extraction?.processingTime
    ? (extraction.processingTime / 1000).toFixed(1)
    : null;

  const sectionsWithFields = SECTIONS.filter(s => (fieldsBySection[s.id]?.length ?? 0) > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">

      {/* ── Header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/mail"
            className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Back to documents"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40">
            <FileText className="size-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium leading-tight">{document.fileName}</h1>
            {document.emailSubject && (
              <p className="truncate text-xs text-muted-foreground">{document.emailSubject}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Model selector */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value as ExtractionModelKey)}
              disabled={extracting}
              className="h-8 cursor-pointer appearance-none rounded-lg border border-input bg-background py-1 pr-7 pl-2.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {Object.entries(EXTRACTION_MODELS).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" />
          </div>

          {!isExtracted || isFailed ? (
            <button
              onClick={runExtraction}
              disabled={extracting}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Cpu className="size-3.5" />}
              {extracting ? "Analyzing…" : "Run extraction"}
            </button>
          ) : (
            <button
              onClick={runExtraction}
              disabled={extracting}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {extracting ? "Re-analyzing…" : "Re-extract"}
            </button>
          )}

          {isExtracted && (
            <button
              onClick={saveEdits}
              disabled={saving}
              title="Publish to CRM (⌘S)"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saved ? <Check className="size-3.5" /> : saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {saved ? "Published" : saving ? "Publishing…" : "Publish to CRM"}
            </button>
          )}
        </div>
      </header>

      {/* ── Error banners ── */}
      {extractError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          {extractError}
        </div>
      )}
      {saveError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* ── Split pane (resizable) ── */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">

        {/* Left — PDF viewer */}
        <ResizablePanel defaultSize={58} minSize={40} className="bg-muted/30">
          <iframe src={`/api/documents/${id}/file`} className="h-full w-full" title="Original PDF" />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right — extraction panel */}
        <ResizablePanel defaultSize={42} minSize={30} className="flex min-w-0 flex-col bg-background">

          {/* ── Waiting state ── */}
          {document.status === "ingested" && !extracting && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40">
                <Cpu className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Ready to extract</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Run extraction to pull structured fields from this document.
                </p>
              </div>
              <button
                onClick={runExtraction}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Cpu className="size-3.5" />
                Run extraction
              </button>
            </div>
          )}

          {/* ── Extracting ── */}
          {extracting && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Analyzing with {EXTRACTION_MODELS[selectedModel].label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedModel === "qwen"
                    ? "Scanned PDFs are OCR'd page-by-page first — this can take 1–2 minutes."
                    : "This may take 15–60 seconds for a multi-page form."}
                </p>
              </div>
            </div>
          )}

          {/* ── Failed ── */}
          {isFailed && !extracting && (
            <div className="p-4">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>Extraction failed. Verify your API key and try re-extracting.</span>
              </div>
            </div>
          )}

          {/* ── Extracted panel ── */}
          {parsed && !extracting && (
            <>
              <SummaryCard
                applicant={applicantName}
                coApplicant={coApplicantName}
                property={propertyAddr}
                confidence={parsed.overallConfidence}
                needsReview={needsReviewTotal}
                sections={activeSections}
                modelLabel={currentModelLabel}
                extractionDate={extractionDate}
                processingTimeSec={processingTimeSec}
              />

              <FilterBar
                filter={filter}
                setFilter={setFilter}
                showEmpty={showEmpty}
                setShowEmpty={setShowEmpty}
                total={allFields.length}
                needsReview={needsReviewTotal}
                emptyCount={emptyTotal}
                lowConf={lowConfTotal}
              />

              {/* Sticky section navigation */}
              <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 py-1.5">
                {sectionsWithFields.map(s => (
                  <button
                    key={s.id}
                    onClick={() => jumpToSection(s.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s.title.replace(" Information", "").replace(" / Eligibility", "")}
                  </button>
                ))}
              </div>

              {/* Sections */}
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {SECTIONS.map(section => {
                  const sFields = fieldsBySection[section.id] ?? [];
                  if (sFields.length === 0) return null;
                  const filtered = applyFilter(sFields, filter, showEmpty);
                  return (
                    <SectionAccordion
                      key={section.id}
                      section={section}
                      fields={filtered}
                      totalCount={sFields.length}
                      avgConf={avg(sFields)}
                      needsReview={sFields.filter(f => f.confidence < 0.85 && !fieldIsEmpty(f)).length}
                      isCollapsed={collapsedSections.has(section.id)}
                      onToggle={() => toggleSection(section.id)}
                      edits={edits}
                      setEdits={setEdits}
                      filter={filter}
                    />
                  );
                })}

                {/* Unmatched fields */}
                {(fieldsBySection["other"]?.length ?? 0) > 0 && (() => {
                  const sFields = fieldsBySection["other"];
                  const filtered = applyFilter(sFields, filter, showEmpty);
                  if (sFields.length === 0) return null;
                  return (
                    <SectionAccordion
                      key="other"
                      section={{ id: "other", title: "Other Fields", defaultExpanded: false }}
                      fields={filtered}
                      totalCount={sFields.length}
                      avgConf={avg(sFields)}
                      needsReview={sFields.filter(f => f.confidence < 0.85 && !fieldIsEmpty(f)).length}
                      isCollapsed={collapsedSections.has("other")}
                      onToggle={() => toggleSection("other")}
                      edits={edits}
                      setEdits={setEdits}
                      filter={filter}
                    />
                  );
                })()}

                <div className="h-4" />
              </div>
            </>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ─── SummaryCard ────────────────────────────────────────────────────────────

function SummaryCard({
  applicant, coApplicant, property, confidence, needsReview, sections,
  modelLabel, extractionDate, processingTimeSec,
}: {
  applicant: string; coApplicant: string; property: string;
  confidence: number; needsReview: number; sections: number;
  modelLabel: string; extractionDate: string | null; processingTimeSec: string | null;
}) {
  const pct = Math.round(confidence * 100);

  return (
    <div className="shrink-0 border-b px-4 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
          DOCUMENT SUMMARY
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{sections} sections</span>
          <ConfidenceBadge score={confidence} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <SummaryRow label="Applicant" value={applicant} />
        <SummaryRow label="Co-applicant" value={coApplicant} />
        <div className="col-span-2">
          <SummaryRow label="Property" value={property} />
        </div>
      </div>

      {/* Extraction run metadata */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="size-3" />
          <span className="font-medium text-foreground">{modelLabel}</span>
        </span>
        {extractionDate && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3" />
              {extractionDate}
            </span>
          </>
        )}
        {processingTimeSec && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="tabular-nums">{processingTimeSec}s</span>
          </>
        )}
        {needsReview > 0 && (
          <Badge variant="outline" className="ml-auto gap-1 border-amber-600/30 bg-amber-50 font-normal text-amber-700">
            <TriangleAlert className="size-3" />
            {needsReview} need review
          </Badge>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground" title={value}>{value}</p>
    </div>
  );
}

// ─── FilterBar ──────────────────────────────────────────────────────────────

function FilterBar({
  filter, setFilter, showEmpty, setShowEmpty, total, needsReview, emptyCount, lowConf,
}: {
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  showEmpty: boolean;
  setShowEmpty: (v: boolean) => void;
  total: number; needsReview: number; emptyCount: number; lowConf: number;
}) {
  const tabs: { id: FilterType; label: string; count: number }[] = [
    { id: "all",            label: "All",          count: total },
    { id: "needs-review",   label: "Needs review", count: needsReview },
    { id: "empty",          label: "Empty",        count: emptyCount },
    { id: "low-confidence", label: "Low conf.",    count: lowConf },
  ];

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
      <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
        {tabs.map(tab => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="text-muted-foreground tabular-nums">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {filter === "all" && (
        <button
          onClick={() => setShowEmpty(!showEmpty)}
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            showEmpty
              ? "border-foreground/20 bg-muted text-foreground"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className={`flex size-3.5 items-center justify-center rounded-[4px] border ${showEmpty ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
            {showEmpty && <Check className="size-2.5" />}
          </span>
          Empty fields
        </button>
      )}
    </div>
  );
}

// ─── SectionAccordion ───────────────────────────────────────────────────────

function SectionAccordion({
  section, fields, totalCount, avgConf, needsReview,
  isCollapsed, onToggle, edits, setEdits, filter,
}: {
  section: SectionDef;
  fields: ExtractedField[];
  totalCount: number;
  avgConf: number;
  needsReview: number;
  isCollapsed: boolean;
  onToggle: () => void;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  filter: FilterType;
}) {
  const hasMatches = fields.length > 0;
  const avgPct = Math.round(avgConf * 100);

  return (
    <div id={`sec-${section.id}`} className="scroll-mt-2 overflow-hidden rounded-lg border">
      {/* Section header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
          />
          <span className="text-sm font-medium">{section.title}</span>
          {needsReview > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              {needsReview}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {hasMatches ? `${fields.length}${fields.length !== totalCount ? `/${totalCount}` : ""}` : totalCount}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{avgPct}%</span>
        </div>
      </button>

      {/* Fields */}
      {!isCollapsed && (
        <div className="divide-y">
          {fields.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {filter === "all" ? "All fields in this section are empty." : "No fields match this filter."}
            </p>
          ) : (
            fields.map(field => (
              <FieldRow key={field.key} field={field} edits={edits} setEdits={setEdits} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── FieldRow ───────────────────────────────────────────────────────────────

function FieldRow({
  field, edits, setEdits,
}: {
  field: ExtractedField;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const isLow = field.confidence < 0.85;

  return (
    <div className="px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label
          htmlFor={`field-${field.key}`}
          className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground"
        >
          {field.label}
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {field.page !== undefined && (
            <span className="text-[10px] text-muted-foreground/70 tabular-nums">p.{field.page}</span>
          )}
          <ConfidenceBadge score={field.confidence} />
        </div>
      </div>

      {field.fieldType === "checkbox" ? (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            id={`field-${field.key}`}
            type="checkbox"
            checked={edits[field.key] === "true"}
            onChange={e => setEdits(prev => ({ ...prev, [field.key]: String(e.target.checked) }))}
            className="size-3.5 rounded border-input accent-primary"
          />
          <span className="text-sm text-foreground">
            {edits[field.key] === "true" ? "Checked" : "Unchecked"}
          </span>
        </label>
      ) : (
        <input
          id={`field-${field.key}`}
          type="text"
          value={edits[field.key] ?? ""}
          onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
          className={`h-8 w-full rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
            isLow ? "border-amber-600/40 focus-visible:border-amber-600/60" : "border-input focus-visible:border-ring"
          }`}
          placeholder="Empty"
        />
      )}
    </div>
  );
}
