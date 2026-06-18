import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import {
  extractFromPdf,
  type ExtractionModelKey,
  EXTRACTION_MODELS,
} from "@/lib/extractor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.OPENROUTER_API_KEY) {
    return new NextResponse("OPENROUTER_API_KEY is not configured", { status: 500 });
  }

  const document = db.documents.get(id);
  if (!document) {
    return new NextResponse("Document not found", { status: 404 });
  }

  if (!document.pdfPath || !fs.existsSync(document.pdfPath)) {
    return new NextResponse("PDF file not found on disk", { status: 500 });
  }

  // Model is optional — defaults to "gemini" if not provided or invalid
  let modelKey: ExtractionModelKey = "gemini";
  try {
    const body = await req.json().catch(() => ({}));
    const requested = (body as { model?: string }).model;
    if (requested && requested in EXTRACTION_MODELS) {
      modelKey = requested as ExtractionModelKey;
    }
  } catch {
    // body parsing is best-effort
  }

  const startedAt = Date.now();

  try {
    const pdfBuffer = fs.readFileSync(document.pdfPath);
    const { result, raw } = await extractFromPdf(pdfBuffer, modelKey);
    const processingTime = Date.now() - startedAt;

    const extraction = db.extractions.insert({
      documentId: id,
      extractedJson: JSON.stringify(result),
      geminiRaw: raw,
      confidence: result.overallConfidence,
      model: modelKey,
      processingTime,
    });

    db.documents.update(id, { status: "extracted" });

    return NextResponse.json({ extraction });
  } catch (e) {
    db.documents.update(id, { status: "failed" });
    const message = e instanceof Error ? e.message : "Extraction failed";
    console.error("Extraction failed:", message);
    return new NextResponse(message, { status: 500 });
  }
}
