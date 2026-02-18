import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { extractText, getDocumentProxy } from "unpdf";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");

async function loadEnv() {
  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch (_) {}
}

const pdfPath = process.argv[2] || join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/Law School/CorpRestruct/Ocean Trails v. MLN Topco.pdf"
);

async function main() {
  await loadEnv();
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OPENAI_API_KEY not set in .env");
    process.exit(1);
  }
  let text;
  try {
    const buf = await readFile(pdfPath);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const out = await extractText(pdf, { mergePages: true });
    text = out.text ?? "";
    console.error("Extracted", text.length, "chars from PDF");
  } catch (e) {
    console.error("PDF read failed:", e.message);
    process.exit(1);
  }
  if (!text.trim()) {
    console.error("No text extracted");
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert at analyzing corporate restructuring and bankruptcy documents. Extract structured data into JSON. Use exactly these keys: caseName, debtors, creditors, assets, equity, transactions, liens, guarantees. Each entity must have: id (e.g. d1, c1, a1, e1), name, notes (short), type (one of: debtor, creditor, asset, equity). Transactions: id, fromId, toId, amount (number; positive = flow to target). Liens: id, creditorId, assetId or debtorId. Guarantees: id, guarantorId, beneficiaryId. Return only valid JSON, no markdown or code fence.`,
      },
      { role: "user", content: text.slice(0, 120000) },
    ],
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    console.error("No response from OpenAI");
    process.exit(1);
  }
  const outPath = join(root, "public", "sample-ocean-trails.json");
  await writeFile(outPath, raw, "utf8");
  console.log("Wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
