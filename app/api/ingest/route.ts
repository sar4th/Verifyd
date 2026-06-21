import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import { TOKEN_COOKIE } from "@/lib/auth";
import { db, STORAGE_DIR } from "@/lib/db";

type GraphAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  "@odata.type"?: string;
};

function isPdf(a: GraphAttachment): boolean {
  return (
    a.contentType === "application/pdf" ||
    (a.name?.toLowerCase().endsWith(".pdf") ?? false)
  );
}

export async function POST(req: NextRequest) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/api/auth/login", req.url));
  }

  const formData = await req.formData();
  const messageId = formData.get("messageId") as string | null;
  const emailSubject = (formData.get("emailSubject") as string | null) ?? "";

  if (!messageId) {
    return new NextResponse("Missing messageId", { status: 400 });
  }

  // List every attachment on the message (we keep all the PDFs, not just the first).
  const listRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=id,name,contentType,size`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) {
    return new NextResponse(
      `Failed to fetch attachments: ${await listRes.text()}`,
      { status: 502 }
    );
  }

  const { value: attachments } = (await listRes.json()) as { value: GraphAttachment[] };
  const pdfs = attachments.filter(isPdf);

  if (pdfs.length === 0) {
    return new NextResponse("No PDF attachment found in this email.", { status: 400 });
  }

  // Ingest every PDF. Each attachment becomes its own document, keyed by
  // (messageId, attachmentId) so re-processing the email is idempotent and a
  // single email with many PDFs yields many reviewable documents.
  const errors: string[] = [];
  for (const pdf of pdfs) {
    try {
      if (db.documents.findByAttachment(messageId, pdf.id)) continue; // already ingested

      const dlRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${pdf.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!dlRes.ok) {
        errors.push(`${pdf.name}: download failed (${dlRes.status})`);
        continue;
      }

      const { contentBytes } = (await dlRes.json()) as { contentBytes?: string };
      if (!contentBytes) {
        errors.push(`${pdf.name}: no content returned`);
        continue;
      }
      const buffer = Buffer.from(contentBytes, "base64");

      const doc = db.documents.insert({
        fileName: pdf.name,
        pdfPath: "",
        status: "ingested",
        messageId,
        attachmentId: pdf.id,
        emailSubject,
      });

      const pdfPath = path.join(STORAGE_DIR, `${doc.id}.pdf`);
      fs.writeFileSync(pdfPath, buffer);
      db.documents.update(doc.id, { pdfPath });
    } catch (e) {
      errors.push(`${pdf.name}: ${e instanceof Error ? e.message : "ingest failed"}`);
    }
  }

  const ingested = db.documents.forMessage(messageId);
  if (ingested.length === 0) {
    return new NextResponse(
      `Failed to ingest any PDFs.${errors.length ? ` ${errors.join("; ")}` : ""}`,
      { status: 502 }
    );
  }

  // Land on the email workspace — it shows every attachment side-by-side with
  // the original message and the extracted fields.
  return NextResponse.redirect(new URL(`/email/${messageId}`, req.url));
}
