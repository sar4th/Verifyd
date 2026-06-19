import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

// On serverless hosts (Vercel/Lambda) the deployment dir is read-only — only
// /tmp is writable. Locally we keep using the project directory so files persist.
// NOTE: /tmp is ephemeral and not shared across instances, so this is suitable
// for a demo/single session but is not durable storage. For production, swap
// this layer for a database + object store (e.g. Postgres + Vercel Blob/S3).
const BASE_DIR = process.env.VERCEL ? os.tmpdir() : process.cwd();
const DATA_DIR = path.join(BASE_DIR, "data");
export const STORAGE_DIR = path.join(BASE_DIR, "storage");

function ensureDirs(): void {
  for (const dir of [DATA_DIR, STORAGE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// Create directories on import where possible; ignore failures so importing the
// module never crashes a cold start. Writes call ensureDirs() again defensively.
try {
  ensureDirs();
} catch {
  // best-effort — re-attempted lazily before each write
}

export type DocumentStatus = "ingested" | "extracted" | "failed";

export type Document = {
  id: string;
  fileName: string;
  pdfPath: string;
  status: DocumentStatus;
  messageId: string;
  attachmentId: string;
  emailSubject: string;
  createdAt: string;
  // Set true once an underwriter publishes the reviewed fields to the CRM.
  // Drives the "Review Queue" vs "Completed" pipeline views.
  published?: boolean;
};

export type Extraction = {
  id: string;
  documentId: string;
  extractedJson: string;
  geminiRaw: string;
  confidence: number;
  model?: string;       // ExtractionModelKey used for this run
  processingTime?: number; // milliseconds
  createdAt: string;
};

function read<T>(file: string): T[] {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T[];
  } catch {
    return [];
  }
}

function write<T>(file: string, data: T[]): void {
  ensureDirs();
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export const db = {
  documents: {
    get: (id: string): Document | undefined =>
      read<Document>("documents.json").find((d) => d.id === id),

    // Every document, newest first — for the pipeline (Review Queue / Completed) views.
    all: (): Document[] =>
      read<Document>("documents.json").sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),

    findByAttachment: (messageId: string, attachmentId: string): Document | undefined =>
      read<Document>("documents.json").find(
        (d) => d.messageId === messageId && d.attachmentId === attachmentId
      ),

    // All documents ingested from one email, oldest first (stable display order).
    forMessage: (messageId: string): Document[] =>
      read<Document>("documents.json")
        .filter((d) => d.messageId === messageId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

    insert: (data: Omit<Document, "id" | "createdAt">): Document => {
      const docs = read<Document>("documents.json");
      const doc: Document = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
      write("documents.json", [...docs, doc]);
      return doc;
    },

    update: (id: string, patch: Partial<Document>): Document | undefined => {
      const docs = read<Document>("documents.json");
      const idx = docs.findIndex((d) => d.id === id);
      if (idx === -1) return undefined;
      docs[idx] = { ...docs[idx], ...patch };
      write("documents.json", docs);
      return docs[idx];
    },
  },

  extractions: {
    forDocument: (documentId: string): Extraction | undefined =>
      read<Extraction>("extractions.json")
        .filter((e) => e.documentId === documentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],

    insert: (data: Omit<Extraction, "id" | "createdAt">): Extraction => {
      const exts = read<Extraction>("extractions.json");
      const ext: Extraction = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
      write("extractions.json", [...exts, ext]);
      return ext;
    },

    update: (id: string, patch: Partial<Extraction>): void => {
      const exts = read<Extraction>("extractions.json");
      const idx = exts.findIndex((e) => e.id === id);
      if (idx === -1) return;
      exts[idx] = { ...exts[idx], ...patch };
      write("extractions.json", exts);
    },
  },
};
