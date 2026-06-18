import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
export const STORAGE_DIR = path.join(process.cwd(), "storage");

for (const dir of [DATA_DIR, STORAGE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export const db = {
  documents: {
    get: (id: string): Document | undefined =>
      read<Document>("documents.json").find((d) => d.id === id),

    findByAttachment: (messageId: string, attachmentId: string): Document | undefined =>
      read<Document>("documents.json").find(
        (d) => d.messageId === messageId && d.attachmentId === attachmentId
      ),

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
