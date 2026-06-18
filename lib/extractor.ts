import { z } from "zod";

// ── Model registry ─────────────────────────────────────────────────────────────
// All extraction requests go through OpenRouter — no vendor SDKs, no local PDF libs.
//
// inputMode:
//   "vision" — PDF sent as a base64 data URL in image_url. Gemini decodes PDFs
//              natively, including scanned/image-only pages.
//   "file"   — PDF sent as a `file` content part; OpenRouter's file-parser plugin
//              extracts the document server-side (OCR for scanned pages) and feeds
//              the text to the model. Used for models that can't read PDFs directly
//              (e.g. Qwen via the Parasail provider).

export const EXTRACTION_MODELS = {
  gemini: {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    inputMode: "vision" as const,
  },
  qwen: {
    id: "qwen/qwen2.5-vl-72b-instruct",
    label: "Qwen 2.5 VL",
    inputMode: "file" as const,
  },
} as const;

export type ExtractionModelKey = keyof typeof EXTRACTION_MODELS;

// OpenRouter file-parser OCR engine. "mistral-ocr" reads scanned/image PDFs
// (~$2 / 1000 pages). Set OPENROUTER_PDF_ENGINE=pdf-text for free text-only parsing.
const PDF_ENGINE = process.env.OPENROUTER_PDF_ENGINE ?? "mistral-ocr";

// ── Schemas (canonical) ────────────────────────────────────────────────────────

export const FieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  page: z.number().int().optional(),
  fieldType: z.enum(["printed", "handwritten", "checkbox", "selection"]).optional(),
});

export const ExtractionSchema = z.object({
  documentType: z.string(),
  overallConfidence: z.number().min(0).max(1),
  fields: z.array(FieldSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
export type ExtractedField = z.infer<typeof FieldSchema>;

// ── Single extraction prompt (both models use this) ────────────────────────────

const PROMPT = `You are an expert at extracting structured information from application forms.

Analyze this document and extract ALL form fields — printed, handwritten, checkboxes, tables, and selections.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, no explanation):
{
  "documentType": "type of form e.g. loan application",
  "overallConfidence": 0.85,
  "fields": [
    {
      "key": "camelCaseFieldIdentifier",
      "label": "Field label as it appears on the form",
      "value": "extracted value, or null if blank",
      "confidence": 0.9,
      "page": 1,
      "fieldType": "printed"
    }
  ]
}

Confidence rules:
- 0.9–1.0: clearly printed text, unambiguous
- 0.7–0.89: mostly clear, minor uncertainty
- 0.5–0.69: partially obscured or ambiguous
- 0.0–0.49: very unclear or best guess

fieldType values: "printed" (typed), "handwritten" (written by hand), "checkbox" (tick box — value = true/false), "selection" (dropdown/radio)
Include ALL fields, even blank ones (value = null).
For table rows, create one field per cell using a descriptive key like "tableRowNColumnName".`;

// ── Message builders ────────────────────────────────────────────────────────

function buildMessages(
  modelKey: ExtractionModelKey,
  b64: string,
  hint?: string
): { messages: unknown[]; plugins?: unknown[] } {
  const prompt = hint ? `${PROMPT}\n\nIMPORTANT: ${hint}` : PROMPT;
  const dataUrl = `data:application/pdf;base64,${b64}`;

  if (EXTRACTION_MODELS[modelKey].inputMode === "vision") {
    return {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    };
  }

  // "file" mode — OpenRouter parses the PDF server-side via the file-parser plugin.
  return {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "file",
            file: { filename: "document.pdf", file_data: dataUrl },
          },
        ],
      },
    ],
    plugins: [{ id: "file-parser", pdf: { engine: PDF_ENGINE } }],
  };
}

// ── OpenRouter HTTP call ───────────────────────────────────────────────────────

async function openRouterPost(
  modelId: string,
  payload: { messages: unknown[]; plugins?: unknown[] }
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  // Fail cleanly instead of hanging forever if OpenRouter stalls.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Document Extractor",
      },
      body: JSON.stringify({
        model: modelId,
        response_format: { type: "json_object" },
        messages: payload.messages,
        ...(payload.plugins ? { plugins: payload.plugins } : {}),
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `${modelId} timed out after 120s. Scanned PDFs are slow to OCR — try again or use Gemini 2.5 Flash.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`OpenRouter error (${modelId}):`, body);
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message: string };
  };

  if (json.error) throw new Error(`OpenRouter error: ${json.error.message}`);

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenRouter");
  return content;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function extractFromPdf(
  pdfBuffer: Buffer,
  modelKey: ExtractionModelKey = "gemini"
): Promise<{ result: ExtractionResult; raw: string }> {
  const modelId = EXTRACTION_MODELS[modelKey].id;
  const b64 = pdfBuffer.toString("base64");

  let raw = await openRouterPost(modelId, buildMessages(modelKey, b64));

  try {
    const result = ExtractionSchema.parse(JSON.parse(raw));
    return { result, raw };
  } catch (firstError) {
    const hint =
      firstError instanceof z.ZodError
        ? `Fix schema issues: ${firstError.errors
            .slice(0, 3)
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ")}. Return ONLY valid JSON.`
        : "Your response was not valid JSON. Return ONLY the JSON object, no markdown.";

    raw = await openRouterPost(modelId, buildMessages(modelKey, b64, hint));
    const result = ExtractionSchema.parse(JSON.parse(raw));
    return { result, raw };
  }
}
