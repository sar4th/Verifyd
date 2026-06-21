import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";

type GraphMessageDetail = {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  hasAttachments: boolean;
  from: { emailAddress: { name: string | null; address: string | null } } | null;
  toRecipients?: { emailAddress: { name: string | null; address: string | null } }[];
  body?: { contentType: "html" | "text"; content: string } | null;
};

type GraphAttachmentMeta = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

function isPdfAttachment(a: GraphAttachmentMeta): boolean {
  return (
    a.contentType === "application/pdf" ||
    (a.name?.toLowerCase().endsWith(".pdf") ?? false)
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return new NextResponse("Not authenticated", { status: 401 });

  // Pull the full message (incl. body HTML) from Graph.
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}` +
      `?$select=id,subject,bodyPreview,receivedDateTime,hasAttachments,from,toRecipients,body`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) {
    return new NextResponse(`Failed to load message: ${await res.text()}`, {
      status: res.status,
    });
  }
  const msg = (await res.json()) as GraphMessageDetail;

  // Attach every ingested document for this email, newest extraction included.
  const documents = db.documents.forMessage(messageId).map((doc) => {
    const extraction = db.extractions.forDocument(doc.id);
    return {
      id: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      createdAt: doc.createdAt,
      extraction: extraction
        ? {
            id: extraction.id,
            confidence: extraction.confidence,
            createdAt: extraction.createdAt,
            extractedJson: extraction.extractedJson,
            model: extraction.model,
            processingTime: extraction.processingTime,
          }
        : null,
    };
  });

  // Fetch attachment metadata so the detail pane can show chips before ingestion.
  // This is additive — existing `email` and `documents` fields are unchanged.
  let attachments: { id: string; name: string; size: number; contentType: string; isPdf: boolean }[] = [];
  if (msg.hasAttachments) {
    const attRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=id,name,contentType,size`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (attRes.ok) {
      const { value } = (await attRes.json()) as { value: GraphAttachmentMeta[] };
      attachments = value.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        contentType: a.contentType,
        isPdf: isPdfAttachment(a),
      }));
    }
  }

  return NextResponse.json({
    email: {
      id: msg.id,
      subject: msg.subject,
      bodyPreview: msg.bodyPreview,
      receivedDateTime: msg.receivedDateTime,
      hasAttachments: msg.hasAttachments,
      fromName: msg.from?.emailAddress.name ?? null,
      fromAddress: msg.from?.emailAddress.address ?? null,
      to:
        msg.toRecipients?.map((r) => r.emailAddress.address).filter(Boolean) ?? [],
      bodyHtml: msg.body?.contentType === "html" ? msg.body.content : null,
      bodyText: msg.body?.contentType === "text" ? msg.body.content : null,
    },
    documents,
    attachments,
  });
}
