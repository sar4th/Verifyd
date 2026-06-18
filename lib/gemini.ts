import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

const PROMPT = `You are an expert at extracting structured information from application forms.

Analyze this PDF and extract ALL form fields — printed, handwritten, checkboxes, tables, and selections.

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
- 0.5–0.69: handwritten or partially obscured
- 0.0–0.49: very unclear or best guess

fieldType values: "printed" (typed), "handwritten" (written by hand), "checkbox" (tick box — value = true/false), "selection" (dropdown/radio)
Include ALL fields, even blank ones (value = null).
For table rows, create one field per cell using a descriptive key like "tableRowNColumnName".`;

function getModel() {
  return client.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
}

async function callGemini(b64: string, extraHint?: string): Promise<string> {
  const model = getModel();
  const prompt = extraHint ? `${PROMPT}\n\nIMPORTANT: ${extraHint}` : PROMPT;
  const result = await model.generateContent([
    { inlineData: { mimeType: "application/pdf", data: b64 } },
    prompt,
  ]);
  return result.response.text();
}

export async function extractFromPdf(
  pdfBuffer: Buffer
): Promise<{ result: ExtractionResult; raw: string }> {
  const b64 = pdfBuffer.toString("base64");

  let raw = await callGemini(b64);

  try {
    const result = ExtractionSchema.parse(JSON.parse(raw));
    return { result, raw };
  } catch (firstError) {
    // One retry with a hint about what failed
    const hint =
      firstError instanceof z.ZodError
        ? `Fix schema issues: ${firstError.errors
            .slice(0, 3)
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ")}. Return ONLY valid JSON.`
        : "Your response was not valid JSON. Return ONLY the JSON object, no markdown.";

    raw = await callGemini(b64, hint);
    const result = ExtractionSchema.parse(JSON.parse(raw));
    return { result, raw };
  }
}
