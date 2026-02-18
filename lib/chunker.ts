const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 100;

export interface RawChunk {
  id: number;
  text: string;
}

export function chunkText(text: string): RawChunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: RawChunk[] = [];
  let buffer = "";
  let id = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length + 1 > CHUNK_SIZE && buffer.length > 0) {
      chunks.push({ id: id++, text: buffer.trim() });
      const words = buffer.split(/\s+/);
      const overlapWords = words.slice(-Math.min(words.length, Math.floor(CHUNK_OVERLAP / 5)));
      buffer = overlapWords.join(" ") + " " + trimmed;
    } else {
      buffer = buffer ? buffer + "\n\n" + trimmed : trimmed;
    }
  }

  if (buffer.trim()) {
    chunks.push({ id: id++, text: buffer.trim() });
  }

  if (chunks.length === 0 && text.trim()) {
    const words = text.trim().split(/\s+/);
    for (let i = 0; i < words.length; i += CHUNK_SIZE / 5) {
      const slice = words.slice(i, i + CHUNK_SIZE / 5);
      if (slice.length > 0) {
        chunks.push({ id: id++, text: slice.join(" ") });
      }
    }
  }

  return chunks;
}
