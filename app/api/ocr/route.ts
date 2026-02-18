import { NextResponse } from "next/server";

const LLAMA_API = "https://api.cloud.llamaindex.ai/api/parsing";

async function pollJob(jobId: string, apiKey: string): Promise<string> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${LLAMA_API}/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    const data = await res.json();
    if (data.status === "SUCCESS") {
      const textRes = await fetch(`${LLAMA_API}/job/${jobId}/result/text`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!textRes.ok) throw new Error(`Result fetch failed: ${textRes.status}`);
      const textData = await textRes.json();
      return textData.text ?? "";
    }
    if (data.status === "ERROR") throw new Error(data.error ?? "LlamaParse job failed");
  }
  throw new Error("LlamaParse timed out");
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "LLAMA_CLOUD_API_KEY not set" }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.type.includes("pdf")) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name);

    const uploadRes = await fetch(`${LLAMA_API}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`LlamaParse upload failed: ${err}`);
    }

    const uploadData = await uploadRes.json();
    const jobId = uploadData.id;
    if (!jobId) throw new Error("No job ID returned from LlamaParse");

    const text = await pollJob(jobId, apiKey);
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "OCR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
