"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Loader2,
  RefreshCw,
  Send,
  TriangleAlert,
  ZapOff,
} from "lucide-react";
import { EXTRACTION_MODELS, type ExtractionModelKey } from "@/lib/extractor";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ExtractedField = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  confidence: number;
  page?: number;
  fieldType?: string;
};

export type ExtractionResult = {
  documentType: string;
  overallConfidence: number;
  fields: ExtractedField[];
};

export type ExtractionData = {
  id: string;
  confidence: number;
  createdAt: string;
  extractedJson: string;
  model?: string;
  processingTime?: number;
} | null;

type SectionDef = { id: string; title: string; defaultExpanded: boolean };
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

function findFieldValue(fields: ExtractedField[], pattern: RegExp, exclude?: RegExp): string {
  const f = fields.find(f => {
    const t = `${f.key} ${f.label}`;
    if (exclude?.test(t)) return false;
    return pattern.test(t) && !fieldIsEmpty(f);
  });
  return f ? String(f.value) : "—";
}

// ─── Confidence helpers ─────────────────────────────────────────────────────

type ConfidenceTier = "high" | "medium" | "low";

function confidenceTier(score: number): ConfidenceTier {
  if (score >= 0.85) return "high";
  if (score >= 0.60) return "medium";
  return "low";
}

function confidenceBadgeClasses(score: number): string {
  const tier = confidenceTier(score);
  if (tier === "high")   return "text-emerald-700 bg-emerald-50 ring-emerald-600/20";
  if (tier === "medium") return "text-amber-700 bg-amber-50 ring-amber-600/20";
  return "text-red-700 bg-red-50 ring-red-600/20";
}

function confidenceBarColor(score: number): string {
  const tier = confidenceTier(score);
  if (tier === "high")   return "bg-emerald-500";
  if (tier === "medium") return "bg-amber-400";
  return "bg-red-400";
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset ${confidenceBadgeClasses(score)}`}>
      {pct}%
    </span>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

export function ExtractionPanel({
  documentId,
  initialStatus,
  initialExtraction,
  onActivePage,
  onChange,
}: {
  documentId: string;
  initialStatus: string;
  initialExtraction: ExtractionData;
  /** Called with a page number when a field is focused, so a viewer can follow along. */
  onActivePage?: (page: number) => void;
  /** Called after a successful extract/save so a parent list can refresh. */
  onChange?: () => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [extraction, setExtraction] = useState<ExtractionData>(initialExtraction);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterType>("all");
  const [showEmpty, setShowEmpty] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(SECTIONS.filter(s => !s.defaultExpanded).map(s => s.id))
  );
  const [selectedModel, setSelectedModel] = useState<ExtractionModelKey>("gemini");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Seed edit buffer from whatever extraction we have.
  useEffect(() => {
    if (!extraction) return;
    const parsed = JSON.parse(extraction.extractedJson) as ExtractionResult;
    const init: Record<string, string> = {};
    for (const f of parsed.fields) init[f.key] = f.value === null ? "" : String(f.value);
    setEdits(init);
  }, [extraction]);

  useEffect(() => {
    if (filter !== "all") setCollapsedSections(new Set());
  }, [filter]);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}`);
    if (!res.ok) return;
    const d = (await res.json()) as {
      document: { status: string };
      extraction: ExtractionData;
    };
    setStatus(d.document.status);
    setExtraction(d.extraction);
    onChange?.();
  }, [documentId, onChange]);

  const runExtraction = useCallback(async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      if (!res.ok) { setExtractError(await res.text()); return; }
      await reload();
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, [documentId, selectedModel, reload]);

  const saveEdits = useCallback(async () => {
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/save`, {
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
  }, [documentId, edits]);

  const isExtracted = status === "extracted";
  const isFailed = status === "failed";

  function toggleSection(id: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function jumpToSection(sid: string) {
    setActiveSection(sid);
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.delete(sid);
      return next;
    });
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector(`#sec-${sid}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const parsed: ExtractionResult | null = extraction
    ? (JSON.parse(extraction.extractedJson) as ExtractionResult)
    : null;

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
  const emptyTotal = allFields.filter(fieldIsEmpty).length;
  const lowConfTotal = allFields.filter(f => f.confidence < 0.60).length;

  const CONTACT_EXCLUDE = /email|e-mail|address|phone|relative|landlord|mortgage|seller|employer|business|manufacturer|ssn|social|birth|\bdob\b|marital|\bsex\b|depend/i;
  const applicantName = findFieldValue(
    allFields,
    /full\s*name|(?:applicant|borrower).*name/i,
    new RegExp(`co[-.\\s]?applicant|coapplicant|co[-.\\s]?borrower|coborrower|${CONTACT_EXCLUDE.source}`, "i")
  );
  const coApplicantName = findFieldValue(allFields, /co[-.\s]?(?:borrower|applicant)/i, CONTACT_EXCLUDE);
  const propertyAddr = findFieldValue(allFields, /subject\s*prop|property\s*addr|propert.*street/i);
  const activeSections = SECTIONS.filter(s => (fieldsBySection[s.id]?.length ?? 0) > 0).length;

  const currentModelKey = (extraction?.model ?? "gemini") as ExtractionModelKey;
  const currentModelLabel = EXTRACTION_MODELS[currentModelKey]?.label ?? extraction?.model ?? "Unknown";
  const extractionDate = extraction?.createdAt
    ? new Date(extraction.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const processingTimeSec = extraction?.processingTime
    ? (extraction.processingTime / 1000).toFixed(1)
    : null;

  const sectionsWithFields = SECTIONS.filter(s => (fieldsBySection[s.id]?.length ?? 0) > 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Extraction
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {/* Model selector */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value as ExtractionModelKey)}
              disabled={extracting}
              className="h-8 cursor-pointer appearance-none rounded-lg border border-input bg-background py-1 pr-7 pl-2.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {Object.entries(EXTRACTION_MODELS).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Run / Re-extract */}
          {!isExtracted || isFailed ? (
            <button
              onClick={runExtraction}
              disabled={extracting}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Cpu className="size-3.5" />}
              {extracting ? "Analyzing…" : "Run extraction"}
            </button>
          ) : (
            <button
              onClick={runExtraction}
              disabled={extracting}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {extracting ? "Re-analyzing…" : "Re-extract"}
            </button>
          )}

          {/* Publish */}
          {isExtracted && (
            <button
              onClick={saveEdits}
              disabled={saving}
              title="Publish to CRM"
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all disabled:opacity-60 ${
                saved
                  ? "bg-emerald-600 text-white"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {saved
                ? <Check className="size-3.5" />
                : saving
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Send className="size-3.5" />
              }
              {saved ? "Published" : saving ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
      </div>

      {/* Error banners */}
      {extractError && (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="leading-relaxed">{extractError}</span>
        </div>
      )}
      {saveError && (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="leading-relaxed">{saveError}</span>
        </div>
      )}

      {/* ── State: Waiting (ingested, not yet extracting) ── */}
      {status === "ingested" && !extracting && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center animate-fade-up">
          <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted/40">
            <Cpu className="size-6 text-muted-foreground" />
          </div>
          <div className="max-w-[22ch]">
            <p className="font-medium text-foreground">Ready to extract</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Run extraction to pull all structured fields from this document using AI vision.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={runExtraction}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Cpu className="size-3.5" />
              Run extraction
            </button>
            <p className="text-[11px] text-muted-foreground">
              Using {EXTRACTION_MODELS[selectedModel].label}
            </p>
          </div>
        </div>
      )}

      {/* ── State: Extracting ── */}
      {extracting && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center animate-fade-up">
          <div className="relative flex size-14 items-center justify-center">
            <div className="absolute inset-0 rounded-2xl border border-primary/20 bg-primary/5" />
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <div className="max-w-[26ch]">
            <p className="font-medium text-foreground">
              Analyzing with {EXTRACTION_MODELS[selectedModel].label}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {selectedModel === "qwen"
                ? "Scanned PDFs are OCR'd page-by-page — this can take 1–3 minutes."
                : "Reading fields, checkboxes, and tables. Usually 15–60 s."}
            </p>
          </div>
        </div>
      )}

      {/* ── State: Failed (no parsed data) ── */}
      {isFailed && !extracting && !parsed && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center animate-fade-up">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5">
            <ZapOff className="size-6 text-destructive" />
          </div>
          <div className="max-w-[26ch]">
            <p className="font-medium text-foreground">Extraction failed</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Verify your API key in settings and try re-extracting. If the document is scanned, Gemini 2.5 Flash tends to be most reliable.
            </p>
          </div>
          <button
            onClick={runExtraction}
            className="inline-flex h-9 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="size-3.5" />
            Try again
          </button>
        </div>
      )}

      {/* ── State: Extracted ── */}
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

          {/* Section jump bar */}
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 py-1.5">
            {sectionsWithFields.map(s => (
              <button
                key={s.id}
                onClick={() => jumpToSection(s.id)}
                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeSection === s.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {s.title.replace(" Information", "").replace(" / Eligibility", "")}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto p-3">
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
                  onActivePage={onActivePage}
                />
              );
            })}

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
                  onActivePage={onActivePage}
                />
              );
            })()}

            <div className="h-4" />
          </div>
        </>
      )}
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
  const tier = confidenceTier(confidence);

  return (
    <div className="shrink-0 border-b px-4 py-3.5">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Document Summary
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{sections} sections</span>
          <ConfidencePill score={confidence} pct={pct} tier={tier} />
        </div>
      </div>

      {/* Key fields grid */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
        <SummaryRow label="Applicant" value={applicant} />
        <SummaryRow label="Co-applicant" value={coApplicant} />
        <div className="col-span-2">
          <SummaryRow label="Property" value={property} />
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mt-3 overflow-hidden rounded-full bg-muted/60" style={{ height: 3 }}>
        <div
          className={`h-full rounded-full transition-all duration-700 ${confidenceBarColor(confidence)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Meta row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
          <Badge
            variant="outline"
            className="ml-auto gap-1 border-amber-600/20 bg-amber-50 text-[11px] font-normal text-amber-700"
          >
            <TriangleAlert className="size-3" />
            {needsReview} need review
          </Badge>
        )}
      </div>
    </div>
  );
}

function ConfidencePill({ score, pct, tier }: { score: number; pct: number; tier: ConfidenceTier }) {
  const colorMap: Record<ConfidenceTier, string> = {
    high: "text-emerald-700 bg-emerald-50 ring-emerald-600/20",
    medium: "text-amber-700 bg-amber-50 ring-amber-600/20",
    low: "text-red-700 bg-red-50 ring-red-600/20",
  };
  // Avoid unused-variable lint — score is intentionally kept for future use
  void score;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset tabular-nums ${colorMap[tier]}`}>
      {pct}% confidence
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground" title={value}>{value}</p>
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
    { id: "all",            label: "All",     count: total },
    { id: "needs-review",   label: "Review",  count: needsReview },
    { id: "empty",          label: "Empty",   count: emptyCount },
    { id: "low-confidence", label: "Low",     count: lowConf },
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
              <span className={`text-[11px] tabular-nums ${active ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                {tab.count}
              </span>
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
          <span
            className={`flex size-3.5 items-center justify-center rounded-[4px] border transition-colors ${
              showEmpty ? "border-primary bg-primary text-primary-foreground" : "border-input"
            }`}
          >
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
  isCollapsed, onToggle, edits, setEdits, filter, onActivePage,
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
  onActivePage?: (page: number) => void;
}) {
  const hasMatches = fields.length > 0;
  const avgPct = Math.round(avgConf * 100);
  const tier = confidenceTier(avgConf);
  const barColor = confidenceBarColor(avgConf);

  return (
    <div id={`sec-${section.id}`} className="scroll-mt-2 overflow-hidden rounded-lg border bg-background">
      <button
        onClick={onToggle}
        className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
          />
          <span className="text-xs font-semibold text-foreground">{section.title}</span>
          {needsReview > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
              {needsReview}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {hasMatches ? `${fields.length}${fields.length !== totalCount ? `/${totalCount}` : ""}` : totalCount}
          </span>
          {/* Mini confidence indicator */}
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-10 overflow-hidden rounded-full bg-muted/60">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${avgPct}%` }}
              />
            </div>
            <span className={`text-[11px] font-medium tabular-nums ${
              tier === "high" ? "text-emerald-700" : tier === "medium" ? "text-amber-700" : "text-red-600"
            }`}>
              {avgPct}%
            </span>
          </div>
        </div>
      </button>

      {!isCollapsed && (
        <div className="divide-y border-t">
          {fields.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs text-muted-foreground">
              {filter === "all" ? "All fields in this section are empty." : "No fields match this filter."}
            </p>
          ) : (
            fields.map(field => (
              <FieldRow
                key={field.key}
                field={field}
                edits={edits}
                setEdits={setEdits}
                onActivePage={onActivePage}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── FieldRow ───────────────────────────────────────────────────────────────

function FieldRow({
  field, edits, setEdits, onActivePage,
}: {
  field: ExtractedField;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onActivePage?: (page: number) => void;
}) {
  const tier = confidenceTier(field.confidence);
  const [focused, setFocused] = useState(false);

  const focusPage = () => {
    if (field.page !== undefined) onActivePage?.(field.page);
  };

  const borderClass = focused
    ? tier === "low"
      ? "border-red-400 ring-2 ring-red-400/20"
      : "border-ring ring-2 ring-ring/20"
    : tier === "medium"
      ? "border-amber-300/60"
      : tier === "low"
        ? "border-red-300/60"
        : "border-input";

  return (
    <div className="group px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          htmlFor={`field-${field.key}`}
          className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 group-focus-within:text-muted-foreground"
        >
          {field.label}
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {field.page !== undefined && (
            <button
              type="button"
              onClick={focusPage}
              className="text-[10px] text-muted-foreground/50 tabular-nums underline-offset-2 hover:text-muted-foreground hover:underline"
            >
              p.{field.page}
            </button>
          )}
          <ConfidenceBadge score={field.confidence} />
        </div>
      </div>

      {field.fieldType === "checkbox" ? (
        <label className="flex cursor-pointer items-center gap-2">
          <span
            className={`flex size-4 items-center justify-center rounded-[4px] border transition-colors ${
              edits[field.key] === "true"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background"
            }`}
          >
            {edits[field.key] === "true" && <Check className="size-2.5" />}
          </span>
          <input
            id={`field-${field.key}`}
            type="checkbox"
            checked={edits[field.key] === "true"}
            onChange={e => setEdits(prev => ({ ...prev, [field.key]: String(e.target.checked) }))}
            onFocus={focusPage}
            className="sr-only"
          />
          <span className="text-sm text-foreground">
            {edits[field.key] === "true" ? "Yes / Checked" : "No / Unchecked"}
          </span>
        </label>
      ) : (
        <input
          id={`field-${field.key}`}
          type="text"
          value={edits[field.key] ?? ""}
          onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
          onFocus={() => { setFocused(true); focusPage(); }}
          onBlur={() => setFocused(false)}
          className={`h-8 w-full rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 ${borderClass}`}
          placeholder="Empty"
        />
      )}
    </div>
  );
}
