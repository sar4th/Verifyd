import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
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

  if (!document.pdfPath || !fs.existsSync(document.pdfPath)) {
    return new NextResponse("PDF file not found", { status: 404 });
  }

  const buffer = fs.readFileSync(document.pdfPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
