"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { autoLayout } from "@/lib/layout";
import { chunkText } from "@/lib/chunker";
import { retrieveForAllSections, buildSourceContext, buildSectionHints, getSectionQueryTexts } from "@/lib/rag";
import type { EmbeddedChunk } from "@/lib/rag";

const DiagramCanvas = dynamic(
  () => import("@/components/canvas/flow-canvas").then((m) => m.DiagramCanvas),
  { ssr: false },
);
import type { GraphData, GraphNode, GraphEdge, CaseAnalysis, KeyFigure, Citation } from "@/lib/types";
import { emptyGraph, emptyAnalysis, colorForType, ANALYSIS_SECTIONS } from "@/lib/types";
import { CaseBriefPanel } from "@/components/panel/case-brief-panel";

function normalizeExtraction(raw: Record<string, unknown>): GraphData {
  const caseName = String(raw.caseName ?? raw.case_name ?? "Case");
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const nodes: GraphNode[] = rawNodes.map((r: unknown) => {
    const n = r as Record<string, unknown>;
    return {
      id: String(n.id ?? ""),
      label: String(n.label ?? n.name ?? ""),
      type: String(n.type ?? "entity"),
      notes: String(n.notes ?? ""),
      x: 0,
      y: 0,
      color: colorForType(String(n.type ?? "entity")),
    };
  }).filter((n) => n.id && n.label);
  const edges: GraphEdge[] = rawEdges.map((r: unknown) => {
    const e = r as Record<string, unknown>;
    return {
      id: String(e.id ?? `e${Math.random().toString(36).slice(2, 8)}`),
      source: String(e.source ?? e.from ?? ""),
      target: String(e.target ?? e.to ?? ""),
      label: String(e.label ?? ""),
      style: (e.style === "dashed" ? "dashed" : "solid") as "solid" | "dashed",
      color: String(e.color ?? "#94a3b8"),
    };
  }).filter((e) => e.source && e.target);
  if (nodes.length === 0) {
    nodes.push({ id: "n1", label: caseName, type: "entity", notes: "Extracted from PDF", x: 0, y: 0, color: colorForType("entity") });
  }
  return { caseName, nodes, edges };
}

const CITATION_RE = /\[CHUNK\s+(\d+)\]/g;

function extractCitationIds(text: string): number[] {
  const ids: number[] = [];
  let match;
  while ((match = CITATION_RE.exec(text)) !== null) {
    ids.push(Number(match[1]));
  }
  CITATION_RE.lastIndex = 0;
  return [...new Set(ids)];
}

function stripCitationTags(text: string): string {
  return text.replace(/\s*\[CHUNK\s+\d+\]/g, "").trim();
}

function buildCitations(
  text: string,
  chunkMap: Record<number, string>,
  sectionEvidence: { chunk: EmbeddedChunk; score: number }[],
): Citation[] {
  const inlineIds = extractCitationIds(text);

  const citations: Citation[] = [];
  const seen = new Set<number>();

  for (const id of inlineIds) {
    if (chunkMap[id] && !seen.has(id)) {
      seen.add(id);
      const ev = sectionEvidence.find((e) => e.chunk.id === id);
      citations.push({ chunkId: id, text: chunkMap[id], score: ev?.score ?? 0.5 });
    }
  }

  for (const { chunk, score } of sectionEvidence) {
    if (!seen.has(chunk.id) && citations.length < 3) {
      seen.add(chunk.id);
      citations.push({ chunkId: chunk.id, text: chunk.text, score });
    }
  }

  return citations;
}

function parseAnalysis(
  raw: Record<string, unknown>,
  chunkMap: Record<number, string>,
  evidence: Record<string, { chunk: EmbeddedChunk; score: number }[]>,
): CaseAnalysis {
  const figures: KeyFigure[] = Array.isArray(raw.keyFigures)
    ? (raw.keyFigures as Record<string, unknown>[]).map((f) => ({
        label: String(f.label ?? ""),
        value: String(f.value ?? ""),
        category: (["amount", "party", "date", "term", "other"].includes(String(f.category)) ? String(f.category) : "other") as KeyFigure["category"],
      })).filter((f) => f.label && f.value)
    : [];
  const debtStack: import("@/lib/types").DebtFacility[] = Array.isArray(raw.debtStack)
    ? (raw.debtStack as Record<string, unknown>[]).map((d) => ({
        name: String(d.name ?? ""),
        amount: String(d.amount ?? ""),
        lienPosition: String(d.lienPosition ?? ""),
        agent: String(d.agent ?? ""),
        notes: String(d.notes ?? ""),
      })).filter((d) => d.name && d.amount)
    : [];

  const textKeys = [
    "overview", "capitalStructure", "distressTrigger", "transactionMechanics",
    "keyContractTerms", "legalDisputes", "outcomeSignificance", "courtRuling", "buccolaTake",
  ] as const;

  const citations: Record<string, Citation[]> = {};
  const cleaned: Record<string, string> = {};

  for (const key of textKeys) {
    const rawText = String(raw[key] ?? "");
    cleaned[key] = stripCitationTags(rawText);
    const sectionEv = evidence[key] ?? [];
    const cites = buildCitations(rawText, chunkMap, sectionEv);
    if (cites.length > 0) {
      citations[key] = cites;
    }
  }

  return {
    overview: cleaned.overview,
    capitalStructure: cleaned.capitalStructure,
    distressTrigger: cleaned.distressTrigger,
    transactionMechanics: cleaned.transactionMechanics,
    keyContractTerms: cleaned.keyContractTerms,
    legalDisputes: cleaned.legalDisputes,
    outcomeSignificance: cleaned.outcomeSignificance,
    courtRuling: cleaned.courtRuling,
    buccolaTake: cleaned.buccolaTake,
    keyFigures: figures,
    debtStack,
    citations,
  };
}

function parseAnalysisSimple(raw: Record<string, unknown>): CaseAnalysis {
  return parseAnalysis(raw, {}, {});
}

export default function Home() {
  const [mode, setMode] = useState<"landing" | "workspace">("landing");
  const [graph, setGraph] = useState<GraphData>(emptyGraph());
  const [analysis, setAnalysis] = useState<CaseAnalysis>(emptyAnalysis());
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const hasAnalysis = ANALYSIS_SECTIONS.some((s) => analysis[s.key]);

  const handleUpload = useCallback(async (file: File) => {
    setError(null);
    setAnalysis(emptyAnalysis());
    setLoading(true);
    setMode("workspace");
    try {
      setLoadingStep("Extracting text from PDF...");
      const form = new FormData();
      form.append("file", file);
      const ocrRes = await fetch("/api/ocr", { method: "POST", body: form });
      const ocrData = await ocrRes.json();
      if (!ocrRes.ok) throw new Error(ocrData.error ?? "OCR failed");
      const text: string = ocrData.text ?? "";
      if (!text.trim()) throw new Error("No text found in PDF.");

      setLoadingStep("Chunking & embedding source text...");
      const chunks = chunkText(text);
      let embeddedChunks: EmbeddedChunk[] = [];
      let sectionEmbeddings: Record<string, number[]> = {};
      let evidence: Record<string, { chunk: EmbeddedChunk; score: number }[]> = {};
      let chunkMap: Record<number, string> = {};
      let sourceContext = "";
      let sectionHints = "";

      try {
        const sectionQueries = getSectionQueryTexts();
        const embedRes = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunks, queries: sectionQueries }),
        });
        if (embedRes.ok) {
          const embedData = await embedRes.json();
          embeddedChunks = embedData.chunkEmbeddings ?? [];
          sectionEmbeddings = embedData.sectionEmbeddings ?? {};

          if (embeddedChunks.length > 0 && Object.keys(sectionEmbeddings).length > 0) {
            evidence = retrieveForAllSections(sectionEmbeddings, embeddedChunks, 3);
            const ctx = buildSourceContext(evidence);
            sourceContext = ctx.contextString;
            chunkMap = ctx.chunkMap;
            sectionHints = buildSectionHints(evidence);
          }
        }
      } catch {
        // RAG is optional — continue without it
      }

      setLoadingStep("Analyzing case structure...");
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? "Extraction failed");
      const normalized = normalizeExtraction(extractData);
      setGraph(autoLayout(normalized));

      setLoadingStep("Generating case brief with source citations...");
      const summaryRes = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph: normalized,
          sourceContext,
          sectionHints,
        }),
      });
      const summaryData = await summaryRes.json();
      if (summaryRes.ok) {
        setAnalysis(parseAnalysis(summaryData, chunkMap, evidence));
        setShowBrief(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }, []);

  const startScratch = useCallback(() => {
    setMode("workspace");
    setGraph(emptyGraph());
    setAnalysis(emptyAnalysis());
  }, []);

  const downloadPdf = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await toPng(canvasRef.current, { backgroundColor: "#fafafa", pixelRatio: 2 });
      const pageW = 595;
      const pageH = 842;
      const margin = 30;
      const usableW = pageW - margin * 2;
      const pdf = new jsPDF({ unit: "px", format: [pageW, pageH] });

      if (graph.caseName) {
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text(graph.caseName, margin, margin + 14);
      }

      const diagramTop = graph.caseName ? margin + 30 : margin;
      const diagramH = hasAnalysis ? pageH * 0.45 : pageH - margin * 2;
      pdf.addImage(dataUrl, "PNG", margin, diagramTop, usableW, diagramH);

      if (hasAnalysis) {
        let yPos = diagramTop + diagramH + 16;
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, yPos - 8, pageW - margin, yPos - 8);

        for (const section of ANALYSIS_SECTIONS) {
          const val = analysis[section.key];
          if (!val || typeof val !== "string" || val === "Not available from source material.") continue;
          const text = val;
          if (yPos > pageH - 60) { pdf.addPage(); yPos = margin; }
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(71, 85, 105);
          pdf.text(section.title.toUpperCase(), margin, yPos);
          yPos += 12;
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(100, 116, 139);
          const lines = pdf.splitTextToSize(text, usableW);
          pdf.text(lines, margin, yPos);
          yPos += lines.length * 10 + 8;
        }
      }

      const name = graph.caseName || "diagram";
      pdf.save(`${name.replace(/\s+/g, "-")}-brief.pdf`);
    } catch {}
  }, [analysis, graph.caseName, hasAnalysis]);

  if (mode === "landing") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#18181b", marginBottom: 8 }}>BuccolaBot</h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 32 }}>
            Analyze corporate restructuring cases or build capital structure diagrams from scratch.
          </p>

          {error && (
            <div style={{ padding: "10px 16px", background: "#fef2f2", color: "#dc2626", fontSize: 13, borderRadius: 8, marginBottom: 20, textAlign: "left" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: "40px 0" }}>
              <div style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>{loadingStep}</div>
              <div style={{ marginTop: 12, width: 200, height: 3, background: "#e2e8f0", borderRadius: 2, margin: "12px auto 0" }}>
                <div style={{ height: 3, background: "#18181b", borderRadius: 2, width: "60%", animation: "pulse 1.5s infinite" }} />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              <label style={{ cursor: "pointer", width: "100%", maxWidth: 320 }}>
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <div style={{
                  padding: "14px 24px", background: "#18181b", color: "white",
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  transition: "background 0.15s",
                }}>
                  Upload Case PDF
                </div>
              </label>

              <div style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0" }}>or</div>

              <button
                onClick={startScratch}
                style={{
                  padding: "14px 24px", background: "white", color: "#18181b",
                  border: "1px solid #e2e8f0", borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  width: "100%", maxWidth: 320,
                  transition: "border-color 0.15s",
                }}
              >
                Start from Scratch
              </button>

              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.5 }}>
                Right-click the canvas to add nodes. Drag handles to connect them.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const hasContent = graph.nodes.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: "1px solid #e2e8f0", background: "white",
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setMode("landing")}
            style={{ fontWeight: 700, fontSize: 15, background: "none", border: "none", cursor: "pointer", color: "#18181b" }}
          >
            BuccolaBot
          </button>
          {graph.caseName && (
            <span style={{ fontSize: 12, color: "#64748b", borderLeft: "1px solid #e2e8f0", paddingLeft: 12 }}>{graph.caseName}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {loading && <span style={{ fontSize: 11, color: "#64748b", marginRight: 6 }}>{loadingStep}</span>}
          <button
            onClick={() => setShowBrief(!showBrief)}
            style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 500,
              background: showBrief ? "#f1f5f9" : "white", color: "#18181b",
              border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer",
            }}
          >
            {showBrief ? "Hide Brief" : "Case Brief"}
          </button>
          <label style={{ cursor: loading ? "not-allowed" : "pointer" }}>
            <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
            />
            <span role="button" style={{
              display: "inline-block", padding: "5px 12px", fontSize: 12, fontWeight: 500,
              background: "#18181b", color: "white", borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
            }}>
              {loading ? "Processing..." : "Upload PDF"}
            </span>
          </label>
          {hasContent && (
            <button onClick={downloadPdf} style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 500,
              background: "white", color: "#18181b",
              border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer",
            }}>
              Download PDF
            </button>
          )}
        </div>
      </header>

      {error && (
        <div style={{ padding: "6px 16px", background: "#fef2f2", color: "#dc2626", fontSize: 12, borderBottom: "1px solid #fecaca", flexShrink: 0 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 10, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontWeight: 600, fontSize: 12 }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <div ref={canvasRef} style={{ position: "absolute", inset: 0 }}>
            <DiagramCanvas data={graph} onChange={setGraph} />
          </div>
          {!hasContent && !loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", color: "#cbd5e1", gap: 8, pointerEvents: "none",
            }}>
              <p style={{ fontSize: 14, fontWeight: 500 }}>Right-click to add nodes</p>
              <p style={{ fontSize: 12 }}>Drag from blue handles to connect</p>
            </div>
          )}
        </div>

        {showBrief && (
          <CaseBriefPanel
            analysis={analysis}
            caseName={graph.caseName}
            onClose={() => setShowBrief(false)}
            onAnalysisChange={setAnalysis}
          />
        )}
      </div>
    </div>
  );
}
