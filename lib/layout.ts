import dagre from "dagre";
import type { GraphData } from "./types";

const NODE_W = 280;
const BASE_H = 80;
const LINE_H = 16;
const MAX_CHARS_PER_LINE = 35;

function estimateNodeHeight(notes: string): number {
  if (!notes) return BASE_H;
  const lines = notes.split("\n").filter(Boolean);
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / MAX_CHARS_PER_LINE));
  }
  return BASE_H + totalLines * LINE_H;
}

const TYPE_RANK: Record<string, number> = {
  court: 0,
  sponsor: 0,
  holdco: 1, parent: 1,
  admin_agent: 1,
  opco: 2, debtor: 2,
  term_loan: 3, revolver: 3, bond: 3, dip_facility: 3,
  restricted_sub: 4, non_guarantor_sub: 4, subsidiary: 4,
  ad_hoc_group: 4,
  participating_lenders: 5, excluded_lenders: 5,
  unsub: 5,
  interco_loan: 6,
  asset_pool: 6, asset: 6,
  clo: 7,
};

const STRUCTURAL_COLORS = new Set(["#94a3b8"]);
const LIEN_COLORS = new Set(["#3b82f6"]);
const LEGAL_COLORS = new Set(["#8b5cf6"]);

export function autoLayout(data: GraphData): GraphData {
  if (data.nodes.length === 0) return data;

  const edgeCount = data.edges.length;
  const nodeCount = data.nodes.length;
  const density = nodeCount > 0 ? edgeCount / nodeCount : 1;

  const ranksep = density > 3 ? 220 : density > 2 ? 200 : 180;
  const nodesep = density > 3 ? 140 : density > 2 ? 120 : 100;

  const g = new dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    ranksep,
    nodesep,
    edgesep: 80,
    marginx: 60,
    marginy: 60,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });

  const sorted = [...data.nodes].sort((a, b) => {
    const ra = TYPE_RANK[a.type] ?? 8;
    const rb = TYPE_RANK[b.type] ?? 8;
    return ra - rb;
  });

  const ASSET_TYPES = new Set(["asset_pool", "asset"]);
  const CIRCLE_SIZE = 180;

  sorted.forEach((n) => {
    if (ASSET_TYPES.has(n.type)) {
      g.setNode(n.id, { width: CIRCLE_SIZE, height: CIRCLE_SIZE });
    } else {
      const h = estimateNodeHeight(n.notes);
      g.setNode(n.id, { width: NODE_W, height: h });
    }
  });

  const seenPairs = new Set<string>();

  for (const e of data.edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;

    const pairKey = `${e.source}→${e.target}`;
    const isFirst = !seenPairs.has(pairKey);
    seenPairs.add(pairKey);

    const isStructural = STRUCTURAL_COLORS.has(e.color);
    const isLien = LIEN_COLORS.has(e.color);
    const isLegal = LEGAL_COLORS.has(e.color);

    if (isFirst) {
      g.setEdge(e.source, e.target, {
        minlen: isStructural ? 1 : isLegal ? 2 : 2,
        weight: isStructural ? 4 : isLien ? 3 : isLegal ? 1 : 2,
      }, e.id);
    }
  }

  dagre.layout(g);

  const nodes = data.nodes.map((n) => {
    const pos = g.node(n.id);
    const isAsset = ASSET_TYPES.has(n.type);
    const w = isAsset ? CIRCLE_SIZE : NODE_W;
    const h = isAsset ? CIRCLE_SIZE : estimateNodeHeight(n.notes);
    return { ...n, x: pos.x - w / 2, y: pos.y - h / 2 };
  });

  return { ...data, nodes };
}
