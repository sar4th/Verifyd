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
};

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

  // List attachments
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
  const pdf = attachments.find(
    (a) => a.contentType === "application/pdf" || a.name.toLowerCase().endsWith(".pdf")
  );

  if (!pdf) {
    return new NextResponse(
      "No PDF attachment found in this email.",
      { status: 400 }
    );
  }

  // Idempotency — return existing document if already ingested
  const existing = db.documents.findByAttachment(messageId, pdf.id);
  if (existing) {
    return NextResponse.redirect(new URL(`/documents/${existing.id}`, req.url));
  }

  // Download PDF content (Graph returns base64 contentBytes for file attachments)
  const dlRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${pdf.id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!dlRes.ok) {
    return new NextResponse(
      `Failed to download attachment: ${await dlRes.text()}`,
      { status: 502 }
    );
  }

  const { contentBytes } = (await dlRes.json()) as { contentBytes: string };
  const buffer = Buffer.from(contentBytes, "base64");

  // Persist document record first to get the id
  const doc = db.documents.insert({
    fileName: pdf.name,
    pdfPath: "",
    status: "ingested",
    messageId,
    attachmentId: pdf.id,
    emailSubject,
  });

  // Write PDF to storage using the document id as filename
  const pdfPath = path.join(STORAGE_DIR, `${doc.id}.pdf`);
  fs.writeFileSync(pdfPath, buffer);
  db.documents.update(doc.id, { pdfPath });

  return NextResponse.redirect(new URL(`/documents/${doc.id}`, req.url));
}
