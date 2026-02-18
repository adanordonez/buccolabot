export interface EmbeddedChunk {
  id: number;
  text: string;
  embedding: number[];
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function magnitude(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function cosineSim(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

export function retrieveTopK(
  queryEmbedding: number[],
  chunks: EmbeddedChunk[],
  k: number = 3,
): { chunk: EmbeddedChunk; score: number }[] {
  const scored = chunks.map((chunk) => ({
    chunk,
    score: cosineSim(queryEmbedding, chunk.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export interface SectionEvidence {
  sectionKey: string;
  chunkIds: number[];
}

const SECTION_QUERIES: Record<string, string> = {
  overview: "company overview business operations equity sponsor acquisition purchase price",
  capitalStructure: "debt capital structure term loan revolver bonds lien secured collateral agent sacred rights covenants",
  distressTrigger: "financial distress deteriorating performance covenant breach liquidity shortfall maturity wall EBITDA",
  transactionMechanics: "transaction LME drop down double dip up-tier exchange amendment super senior non-pro-rata",
  keyContractTerms: "sacred rights J. Crew blocker Serta blocker omni-blocker grace period internally generated funds required lender unanimous consent",
  legalDisputes: "lawsuit claim breach good faith fair dealing fraudulent conveyance integrated transaction doctrine",
  courtRuling: "court held ruling opinion dismissed survived motion judgment dicta",
  outcomeSignificance: "outcome significance settlement bankruptcy filing forum selection market impact",
  buccolaTake: "key insight analysis creative aggressive structure criticism",
};

export function retrieveForAllSections(
  sectionEmbeddings: Record<string, number[]>,
  chunks: EmbeddedChunk[],
  topK: number = 3,
): Record<string, { chunk: EmbeddedChunk; score: number }[]> {
  const result: Record<string, { chunk: EmbeddedChunk; score: number }[]> = {};
  for (const [key, emb] of Object.entries(sectionEmbeddings)) {
    result[key] = retrieveTopK(emb, chunks, topK);
  }
  return result;
}

export function getSectionQueryTexts(): Record<string, string> {
  return { ...SECTION_QUERIES };
}

export function buildSourceContext(
  evidence: Record<string, { chunk: EmbeddedChunk; score: number }[]>,
): { contextString: string; chunkMap: Record<number, string> } {
  const usedChunks = new Map<number, string>();

  for (const results of Object.values(evidence)) {
    for (const { chunk } of results) {
      if (!usedChunks.has(chunk.id)) {
        usedChunks.set(chunk.id, chunk.text);
      }
    }
  }

  const chunkMap: Record<number, string> = {};
  const lines: string[] = [];
  for (const [id, text] of usedChunks) {
    chunkMap[id] = text;
    lines.push(`[CHUNK ${id}]\n${text}`);
  }

  return {
    contextString: lines.join("\n\n---\n\n"),
    chunkMap,
  };
}

export function buildSectionHints(
  evidence: Record<string, { chunk: EmbeddedChunk; score: number }[]>,
): string {
  const lines: string[] = [];
  for (const [section, results] of Object.entries(evidence)) {
    const ids = results.map((r) => r.chunk.id);
    if (ids.length > 0) {
      lines.push(`${section}: most relevant chunks → [${ids.join(", ")}]`);
    }
  }
  return lines.join("\n");
}
