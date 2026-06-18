import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ExtractionResult } from "@/lib/extractor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const extraction = db.extractions.forDocument(id);
  if (!extraction) {
    return new NextResponse("No extraction found for this document", { status: 404 });
  }

  const body = (await req.json()) as { edits: Record<string, string> };
  const { edits } = body;

  // Overlay user edits onto the extracted fields (model_value is preserved in geminiRaw)
  const parsed = JSON.parse(extraction.extractedJson) as ExtractionResult;
  const updated: ExtractionResult = {
    ...parsed,
    fields: parsed.fields.map((f) => ({
      ...f,
      value: f.key in edits ? edits[f.key] : f.value,
    })),
  };

  db.extractions.update(extraction.id, {
    extractedJson: JSON.stringify(updated),
  });

  return NextResponse.json({ ok: true });
}
