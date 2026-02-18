import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ChunkInput {
  id: number;
  text: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { chunks?: ChunkInput[]; queries?: Record<string, string> };

    if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
      return NextResponse.json({ error: "No chunks provided" }, { status: 400 });
    }

    const chunkTexts = body.chunks.map((c) => c.text);
    const queryKeys = body.queries ? Object.keys(body.queries) : [];
    const queryTexts = body.queries ? Object.values(body.queries) : [];
    const allTexts = [...chunkTexts, ...queryTexts];

    const batchSize = 2048;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < allTexts.length; i += batchSize) {
      const batch = allTexts.slice(i, i + batchSize);
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch,
      });
      for (const item of res.data) {
        allEmbeddings.push(item.embedding);
      }
    }

    const chunkEmbeddings = body.chunks.map((c, i) => ({
      id: c.id,
      text: c.text,
      embedding: allEmbeddings[i],
    }));

    const sectionEmbeddings: Record<string, number[]> = {};
    for (let i = 0; i < queryKeys.length; i++) {
      sectionEmbeddings[queryKeys[i]] = allEmbeddings[chunkTexts.length + i];
    }

    return NextResponse.json({ chunkEmbeddings, sectionEmbeddings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Embedding failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
