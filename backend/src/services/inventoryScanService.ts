import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AppError } from "../utils/AppError";

/**
 * Reads a supplier bill / delivery note / stock list (PDF or photo) with
 * Claude and returns the line items, for the Inventory page's import
 * preview. Nothing is saved here — staff review and edit every row first.
 *
 * Needs ANTHROPIC_API_KEY in backend/.env. Each scan is one Claude request.
 */

const ScannedRow = z.object({
  name: z.string().describe("Product name as printed, cleaned up (no SKU codes unless that's all there is)"),
  quantity: z.number().describe("Quantity delivered/listed, in `unit`. 0 if not shown."),
  unit: z.string().describe('Unit of measure, short: "L", "ml", "kg", "pcs", "bottle", "roll", "box", "can"...'),
  unitCost: z.number().nullable().describe("Price per one unit, before tax. null if not shown."),
  category: z.string().nullable().describe('Best guess: "Chemicals", "Consumables", "Paint", "Parts" or "Tools"; null if unsure'),
});

const ScanResult = z.object({
  supplierName: z.string().nullable().describe("Supplier / shop name on the document, or null"),
  supplierPhone: z.string().nullable().describe("Supplier phone number on the document, or null"),
  documentNote: z.string().nullable().describe("Invoice/bill number and date if shown, e.g. 'Bill 1043, 12 Nov 2026'"),
  items: z.array(ScannedRow),
});

export type ScanResultT = z.infer<typeof ScanResult>;

const SYSTEM = `You read supplier bills, delivery notes and stock lists for a car detailing / auto body service station and extract the stock items on them.
Return every product line. Skip totals, tax, discount, delivery and payment lines.
If a line gives a pack (e.g. "5L can x 4"), set quantity in the base unit when it's clear (20, unit "L"); otherwise keep the pack as the unit (4, unit "can").
unitCost is the price of ONE unit in the same unit you chose, before tax. If only a line total is shown, divide it by the quantity.
Never invent items that are not on the document.`;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

let client: Anthropic | null = null;

export async function scanStockDocument(file: { buffer: Buffer; mimetype: string }): Promise<ScanResultT> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError(
      503,
      "PDF/photo import isn't set up yet: add ANTHROPIC_API_KEY to backend/.env and restart the backend. CSV and Excel import work without it."
    );
  }
  client ??= new Anthropic();

  const data = file.buffer.toString("base64");
  const source: Anthropic.Beta.BetaContentBlockParam =
    file.mimetype === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: file.mimetype as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data,
          },
        };
  if (file.mimetype !== "application/pdf" && !IMAGE_TYPES.has(file.mimetype)) {
    throw new AppError(400, "Upload a PDF or a JPG/PNG/WEBP photo");
  }

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on a fallback model
      // within the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ScanResult) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: "Extract the stock items from this document." }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new AppError(422, "The document couldn't be read. Try a clearer photo, or use CSV/Excel.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AppError(422, "The document is too long to read in one go — split it and import each part.");
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new AppError(422, "Couldn't read any items from this document.");
    return parsed;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AppError(503, "The ANTHROPIC_API_KEY in backend/.env was rejected — check the key.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AppError(429, "The document reader is busy — try again in a minute.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AppError(400, `The document reader couldn't process this file: ${err.message}`);
    }
    if (err instanceof Anthropic.APIError) {
      throw new AppError(502, "The document reader is unavailable right now — try again shortly.");
    }
    throw err;
  }
}
