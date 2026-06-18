import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const document = db.documents.get(id);
  if (!document) {
    return new NextResponse("Not found", { status: 404 });
  }
  const extraction = db.extractions.forDocument(id) ?? null;
  return NextResponse.json({ document, extraction });
}
