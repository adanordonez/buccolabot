"use client";

import { useCallback, useRef, useState, type MouseEvent as RME } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge as rfAddEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  type NodeProps,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
} from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "@/lib/types";
import { colorForType, NODE_TYPE_GROUPS } from "@/lib/types";

const EDGE_COLORS = [
  { value: "#94a3b8", label: "Structural" },
  { value: "#ef4444", label: "Obligations" },
  { value: "#3b82f6", label: "Liens" },
  { value: "#22c55e", label: "Value flow" },
  { value: "#f59e0b", label: "Transactions" },
  { value: "#8b5cf6", label: "Legal" },
];

function EdgeLegend() {
  return (
    <div style={{
      position: "absolute", bottom: 12, left: 12,
      display: "flex", gap: 10, padding: "6px 12px",
      background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)",
      borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      zIndex: 5,
    }}>
      {EDGE_COLORS.map((c) => (
        <div key={c.value} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 3, borderRadius: 2, background: c.value }} />
          <span style={{ fontSize: 9, fontWeight: 500, color: "#6e6e73", letterSpacing: "0.02em" }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

function toRFNodes(nodes: GraphNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label, type: n.type, notes: n.notes, color: n.color },
    type: "entity",
  }));
}

function toRFEdges(edges: GraphEdge[]): Edge[] {
  const pairCount = new Map<string, number>();
  const pairIndex = new Map<string, number>();

  for (const e of edges) {
    const pairKey = [e.source, e.target].sort().join("__");
    pairCount.set(pairKey, (pairCount.get(pairKey) ?? 0) + 1);
  }

  return edges.map((e) => {
    const pairKey = [e.source, e.target].sort().join("__");
    const total = pairCount.get(pairKey) ?? 1;
    const idx = pairIndex.get(pairKey) ?? 0;
    pairIndex.set(pairKey, idx + 1);

    const offset = total > 1 ? (idx - (total - 1) / 2) * 40 : 0;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: "custom",
      data: {
        edgeStyle: e.style,
        edgeColor: e.color,
        edgeLabel: e.label,
        parallelOffset: offset,
        isParallel: total > 1,
      },
      animated: false,
      style: { stroke: e.color, strokeDasharray: e.style === "dashed" ? "6 4" : undefined },
      markerEnd: { type: "arrowclosed" as const, color: e.color },
    };
  });
}

function fromRFNodes(nodes: Node[]): GraphNode[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.data.label as string,
    type: n.data.type as string,
    notes: (n.data.notes as string) ?? "",
    x: n.position.x,
    y: n.position.y,
    color: n.data.color as string,
  }));
}

function fromRFEdges(edges: Edge[]): GraphEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.data?.edgeLabel as string) ?? (e.label as string) ?? "",
    style: ((e.data?.edgeStyle as string) === "dashed" ? "dashed" : "solid") as "solid" | "dashed",
    color: (e.data?.edgeColor as string) ?? "#94a3b8",
  }));
}

type ShapeId = "entity" | "instrument" | "party" | "asset" | "legal";

const SHAPE_MAP: Record<string, ShapeId> = {
  opco: "entity", holdco: "entity", sponsor: "entity",
  restricted_sub: "entity", non_guarantor_sub: "entity", unsub: "entity",
  subsidiary: "entity", parent: "entity", debtor: "entity", equity: "entity",

  term_loan: "instrument", revolver: "instrument", bond: "instrument",
  dip_facility: "instrument", interco_loan: "instrument",

  admin_agent: "party", ad_hoc_group: "party",
  participating_lenders: "party", excluded_lenders: "party",
  clo: "party", lender: "party", creditor: "party", guarantor: "party",

  asset_pool: "asset", asset: "asset",

  court: "legal",
};

function getShape(type: string): ShapeId {
  return SHAPE_MAP[type] ?? "entity";
}

const SHAPE_ICONS: Record<ShapeId, string> = {
  entity: "M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z",
  instrument: "M4 1h8l2 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4l2-3z",
  party: "M8 1a3 3 0 110 6 3 3 0 010-6zM3 14v-1c0-2 2-4 5-4s5 2 5 4v1",
  asset: "M8 1l6.5 4v6L8 15l-6.5-4V5z",
  legal: "M8 1l7 4v1H1V5l7-4zM3 7h2v5H3zm4 0h2v5H7zm4 0h2v5h-2zM1 13h14v2H1z",
};

function ShapeIcon({ shape, color }: { shape: ShapeId; color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d={SHAPE_ICONS[shape]} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function EntityNode({ data, selected }: NodeProps) {
  const color = data.color as string;
  const notes = data.notes as string;
  const nodeType = data.type as string;
  const shape = getShape(nodeType);
  const noteLines = notes ? notes.split("\n").filter(Boolean) : [];
  const hasAmount = noteLines.some((l) => /\$/.test(l));
  const F = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

  const handleStyle = { background: color, width: 8, height: 8, borderColor: "white", borderWidth: 2 };

  if (shape === "instrument") {
    return (
      <div style={{
        minWidth: 200, maxWidth: 270,
        background: `linear-gradient(135deg, ${color}08 0%, ${color}04 100%)`,
        borderRadius: 22,
        borderTop: `2px solid ${color}40`,
        borderRight: `2px solid ${color}40`,
        borderBottom: `2px solid ${color}40`,
        borderLeft: `4px solid ${color}`,
        boxShadow: selected
          ? `0 0 0 2px rgba(59,130,246,0.25), 0 4px 12px rgba(0,0,0,0.08)`
          : `0 2px 8px ${color}15, 0 0 0 1px ${color}12`,
        overflow: "hidden", fontFamily: F,
      }}>
        <Handle type="target" position={Position.Top} style={handleStyle} />
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
        <Handle type="target" position={Position.Left} id="left-t" style={handleStyle} />
        <Handle type="source" position={Position.Right} id="right-s" style={handleStyle} />
        <div style={{ padding: "12px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <ShapeIcon shape="instrument" color={color} />
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color,
            }}>
              {nodeType.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", lineHeight: 1.3 }}>
            {data.label as string}
          </div>
          <NoteLines lines={noteLines} hasAmount={hasAmount} notes={notes} />
        </div>
      </div>
    );
  }

  if (shape === "party") {
    return (
      <div style={{
        minWidth: 200, maxWidth: 260,
        background: "white",
        borderRadius: 14,
        borderTop: `2px dashed ${color}60`,
        borderRight: `2px dashed ${color}60`,
        borderBottom: `2px dashed ${color}60`,
        borderLeft: `2px dashed ${color}60`,
        boxShadow: selected
          ? `0 0 0 2px rgba(59,130,246,0.25), 0 4px 12px rgba(0,0,0,0.08)`
          : "0 1px 4px rgba(0,0,0,0.04)",
        overflow: "hidden", fontFamily: F,
      }}>
        <Handle type="target" position={Position.Top} style={handleStyle} />
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
        <Handle type="target" position={Position.Left} id="left-t" style={handleStyle} />
        <Handle type="source" position={Position.Right} id="right-s" style={handleStyle} />
        <div style={{ padding: "10px 14px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <ShapeIcon shape="party" color={color} />
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", color,
              background: `${color}10`, padding: "2px 8px", borderRadius: 10,
            }}>
              {nodeType.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", lineHeight: 1.3 }}>
            {data.label as string}
          </div>
          <NoteLines lines={noteLines} hasAmount={hasAmount} notes={notes} />
        </div>
      </div>
    );
  }

  if (shape === "asset") {
    const size = 160;
    return (
      <div style={{
        width: size, height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${color}18 0%, ${color}08 60%, white 100%)`,
        border: selected ? `3px solid #3b82f6` : `3px solid ${color}`,
        boxShadow: selected
          ? `0 0 0 3px rgba(59,130,246,0.2), 0 8px 24px ${color}25`
          : `0 4px 16px ${color}20, 0 0 0 1px ${color}15`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center",
        fontFamily: F,
        overflow: "hidden",
        position: "relative",
      }}>
        <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: -4 }} />
        <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -4 }} />
        <Handle type="target" position={Position.Left} id="left-t" style={{ ...handleStyle, left: -4 }} />
        <Handle type="source" position={Position.Right} id="right-s" style={{ ...handleStyle, right: -4 }} />
        <ShapeIcon shape="asset" color={color} />
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#1d1d1f", lineHeight: 1.25,
          marginTop: 4, padding: "0 14px", maxWidth: size - 20,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {data.label as string}
        </div>
        {noteLines.length > 0 && (
          <div style={{
            fontSize: 9, color: hasAmount ? "#2563eb" : "#6e6e73",
            fontWeight: hasAmount ? 700 : 500,
            marginTop: 3, padding: "0 12px",
            lineHeight: 1.3, maxWidth: size - 16,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          }}>
            {noteLines.join(" · ")}
          </div>
        )}
      </div>
    );
  }

  if (shape === "legal") {
    return (
      <div style={{
        minWidth: 200, maxWidth: 260,
        background: "#fafafa",
        borderRadius: 3,
        borderTop: `3px solid ${color}`,
        borderRight: "2px solid #d4d4d8",
        borderBottom: "2px solid #d4d4d8",
        borderLeft: "2px solid #d4d4d8",
        boxShadow: selected
          ? `0 0 0 2px rgba(59,130,246,0.25), 0 4px 12px rgba(0,0,0,0.08)`
          : "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden", fontFamily: F,
      }}>
        <Handle type="target" position={Position.Top} style={handleStyle} />
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
        <Handle type="target" position={Position.Left} id="left-t" style={handleStyle} />
        <Handle type="source" position={Position.Right} id="right-s" style={handleStyle} />
        <div style={{ padding: "10px 14px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <ShapeIcon shape="legal" color={color} />
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "#52525b",
            }}>
              {nodeType.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", lineHeight: 1.3 }}>
            {data.label as string}
          </div>
          <NoteLines lines={noteLines} hasAmount={hasAmount} notes={notes} />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minWidth: 200, maxWidth: 260,
      background: "white",
      borderRadius: 10,
      borderTop: `2px solid ${color}`,
      borderRight: selected ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.08)",
      borderBottom: selected ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.08)",
      borderLeft: selected ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.08)",
      boxShadow: selected
        ? `0 0 0 2px rgba(59,130,246,0.25), 0 4px 12px rgba(0,0,0,0.08)`
        : "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
      overflow: "hidden", fontFamily: F,
    }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left-t" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right-s" style={handleStyle} />
      <div style={{
        background: color, padding: "6px 14px 5px",
        display: "flex", alignItems: "center", gap: 7,
      }}>
        <ShapeIcon shape="entity" color="rgba(255,255,255,0.9)" />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.9)",
        }}>
          {nodeType.replace(/_/g, " ")}
        </span>
      </div>
      <div style={{ padding: "10px 14px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", lineHeight: 1.3 }}>
          {data.label as string}
        </div>
        <NoteLines lines={noteLines} hasAmount={hasAmount} notes={notes} />
      </div>
    </div>
  );
}

const CONTEXT_PATTERNS: [RegExp, string, string][] = [
  [/^\$/, "#2563eb", "600"],
  [/^(Owned by|Controls|Acquired|Equity:)/i, "#8b5cf6", "500"],
  [/^(Borrowed by|Issued by|Borrower|Issuer|From )/i, "#ef4444", "500"],
  [/^(Secured by|1L|2L|Lien|Collateral|Secures)/i, "#3b82f6", "500"],
  [/^(Agent:|Trustee:|Admin)/i, "#94a3b8", "500"],
  [/^(Guarantee|Upstream|Downstream|Double dip)/i, "#f59e0b", "500"],
  [/^(Holds?|Left with|Received|Stuck|Lost)/i, "#d97706", "500"],
  [/^(Key ruling|Filed|Breach|Sacred|Blocker|Serta)/i, "#8b5cf6", "500"],
];

function classifyLine(line: string): { color: string; weight: string; icon: string } {
  const trimmed = line.trim();
  for (const [pattern, color, weight] of CONTEXT_PATTERNS) {
    if (pattern.test(trimmed)) return { color, weight, icon: "" };
  }
  return { color: "#6e6e73", weight: "400", icon: "" };
}

function NoteLines({ lines, hasAmount, notes }: { lines: string[]; hasAmount: boolean; notes: string }) {
  if (lines.length > 0) {
    return (
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 1 }}>
        {lines.map((line, i) => {
          const { color, weight } = classifyLine(line);
          const isDollar = /^\$/.test(line.trim());
          return (
            <div key={i} style={{
              fontSize: isDollar ? 12 : 10.5,
              fontWeight: weight as unknown as number,
              color,
              lineHeight: 1.4,
              fontVariantNumeric: isDollar ? "tabular-nums" : undefined,
              letterSpacing: isDollar ? "-0.01em" : "0.01em",
              padding: isDollar ? "2px 0" : undefined,
              borderBottom: isDollar ? "1px solid rgba(37,99,235,0.12)" : undefined,
              marginBottom: isDollar ? 2 : undefined,
            }}>
              {line}
            </div>
          );
        })}
      </div>
    );
  }
  if (!hasAmount && !notes) {
    return (
      <div style={{ fontSize: 10, color: "#aeaeb2", marginTop: 4, fontStyle: "italic" }}>
        Double-click to add details
      </div>
    );
  }
  return null;
}

function CustomEdge(props: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: Record<string, unknown>;
  style?: React.CSSProperties;
  markerEnd?: string;
}) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const edgeColor = (data?.edgeColor as string) ?? "#94a3b8";
  const edgeStyle = (data?.edgeStyle as string) === "dashed" ? "6 4" : undefined;
  const edgeLabel = (data?.edgeLabel as string) ?? "";
  const parallelOffset = (data?.parallelOffset as number) ?? 0;
  const isParallel = (data?.isParallel as boolean) ?? false;

  const offsetX = parallelOffset;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (isParallel) {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX: sourceX + offsetX,
      sourceY,
      targetX: targetX + offsetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 16,
      offset: Math.abs(parallelOffset) + 20,
    });
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: edgeColor, strokeWidth: 1.5, strokeDasharray: edgeStyle }}
        markerEnd={markerEnd}
      />
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              fontSize: 9,
              fontWeight: 600,
              color: edgeColor,
              background: "rgba(255,255,255,0.92)",
              padding: "2px 7px",
              borderRadius: 4,
              maxWidth: 180,
              textAlign: "center",
              lineHeight: 1.3,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
              borderTop: `2px solid ${edgeColor}20`,
              borderRight: `1px solid ${edgeColor}15`,
              borderBottom: `1px solid ${edgeColor}15`,
              borderLeft: `1px solid ${edgeColor}15`,
            }}
            className="nodrag nopan"
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode };
const edgeTypes: EdgeTypes = { custom: CustomEdge as unknown as EdgeTypes[string] };

interface CtxMenu { x: number; y: number; flowX: number; flowY: number }
interface NewNodeDraft { type: string; label: string; notes: string; x: number; y: number }
interface EditNode { id: string; label: string; type: string; notes: string }
interface EditEdge { id: string; label: string; style: "solid" | "dashed"; color: string }

interface Props {
  data: GraphData;
  onChange: (data: GraphData) => void;
}

function FlowInner({ data, onChange }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(data.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(data.edges));
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [newDraft, setNewDraft] = useState<NewNodeDraft | null>(null);
  const [editNode, setEditNode] = useState<EditNode | null>(null);
  const [editEdge, setEditEdge] = useState<EditEdge | null>(null);
  const instance = useReactFlow();
  const syncRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const syncUp = useCallback(
    (n: Node[], e: Edge[]) => {
      clearTimeout(syncRef.current);
      syncRef.current = setTimeout(() => {
        onChange({ ...data, nodes: fromRFNodes(n), edges: fromRFEdges(e) });
      }, 200);
    },
    [data, onChange],
  );

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      setNodes((prev) => {
        syncUp(prev, edges);
        return prev;
      });
    },
    [onNodesChange, edges, syncUp, setNodes],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setEdges((prev) => {
        syncUp(nodes, prev);
        return prev;
      });
    },
    [onEdgesChange, nodes, syncUp, setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newId = `e${Date.now()}`;
      const newEdge: Edge = {
        id: newId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: "custom",
        data: { edgeStyle: "solid", edgeColor: "#94a3b8", edgeLabel: "" },
        markerEnd: { type: "arrowclosed" as const, color: "#94a3b8" },
      };
      setEdges((eds) => {
        const next = rfAddEdge(newEdge, eds);
        syncUp(nodes, next);
        return next;
      });
      setTimeout(() => setEditEdge({ id: newId, label: "", style: "solid", color: "#94a3b8" }), 100);
    },
    [setEdges, nodes, syncUp],
  );

  const onNodeDoubleClick = useCallback(
    (_: RME, node: Node) => {
      setEditNode({ id: node.id, label: node.data.label as string, type: node.data.type as string, notes: (node.data.notes as string) ?? "" });
    },
    [],
  );

  const onEdgeDoubleClick = useCallback(
    (_: RME, edge: Edge) => {
      setEditEdge({
        id: edge.id,
        label: (edge.data?.edgeLabel as string) ?? "",
        style: ((edge.data?.edgeStyle as string) === "dashed" ? "dashed" : "solid") as "solid" | "dashed",
        color: (edge.data?.edgeColor as string) ?? "#94a3b8",
      });
    },
    [],
  );

  const onPaneContextMenu = useCallback(
    (event: RME | MouseEvent) => {
      event.preventDefault();
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      const flowPos = instance.screenToFlowPosition({ x: clientX, y: clientY });
      setCtxMenu({ x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y });
    },
    [instance],
  );

  const openNewNodeModal = useCallback(
    (type: string, x: number, y: number) => {
      setCtxMenu(null);
      setNewDraft({ type, label: "", notes: "", x, y });
    },
    [],
  );

  const commitNewNode = useCallback(() => {
    if (!newDraft) return;
    const label = newDraft.label.trim() || "Untitled";
    const id = `n${Date.now()}`;
    const color = colorForType(newDraft.type);
    const newNode: Node = {
      id,
      position: { x: newDraft.x, y: newDraft.y },
      data: { label, type: newDraft.type, notes: newDraft.notes.trim(), color },
      type: "entity",
    };
    setNodes((prev) => {
      const next = [...prev, newNode];
      syncUp(next, edges);
      return next;
    });
    setNewDraft(null);
  }, [newDraft, setNodes, edges, syncUp]);

  const saveNodeEdit = useCallback(() => {
    if (!editNode) return;
    const color = colorForType(editNode.type);
    setNodes((prev) => {
      const next = prev.map((n) =>
        n.id === editNode.id ? { ...n, data: { ...n.data, label: editNode.label, type: editNode.type, notes: editNode.notes, color } } : n,
      );
      syncUp(next, edges);
      return next;
    });
    setEditNode(null);
  }, [editNode, setNodes, edges, syncUp]);

  const saveEdgeEdit = useCallback(() => {
    if (!editEdge) return;
    setEdges((prev) => {
      const next = prev.map((e) =>
        e.id === editEdge.id
          ? {
              ...e,
              label: editEdge.label,
              data: { ...e.data, edgeLabel: editEdge.label, edgeStyle: editEdge.style, edgeColor: editEdge.color },
              style: { stroke: editEdge.color, strokeDasharray: editEdge.style === "dashed" ? "6 4" : undefined },
              markerEnd: { type: "arrowclosed" as const, color: editEdge.color },
            }
          : e,
      );
      syncUp(nodes, next);
      return next;
    });
    setEditEdge(null);
  }, [editEdge, setEdges, nodes, syncUp]);

  const prevDataRef = useRef(data);
  if (data !== prevDataRef.current) {
    const newNodes = toRFNodes(data.nodes);
    const newEdges = toRFEdges(data.edges);
    const nodesChanged = data.nodes.length !== prevDataRef.current.nodes.length || data.nodes.some((n, i) => n.id !== prevDataRef.current.nodes[i]?.id);
    const edgesChanged = data.edges.length !== prevDataRef.current.edges.length || data.edges.some((e, i) => e.id !== prevDataRef.current.edges[i]?.id);
    if (nodesChanged) setNodes(newNodes);
    if (edgesChanged) setEdges(newEdges);
    prevDataRef.current = data;
  }

  return (
    <div style={{ width: "100%", height: "100%" }} onClick={() => ctxMenu && setCtxMenu(null)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "custom" }}
      >
        <Background gap={20} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => (n.data.color as string) ?? "#94a3b8"}
          maskColor="rgba(250,250,250,0.8)"
          style={{ borderRadius: 8, borderTop: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0" }}
        />
        <EdgeLegend />
      </ReactFlow>

      {ctxMenu && (
        <div
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y,
            background: "white", borderRadius: 10,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
            padding: "6px 0", zIndex: 1000, minWidth: 220, maxHeight: 420, overflowY: "auto",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          }}
        >
          {NODE_TYPE_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "#86868b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {group.label}
              </div>
              {group.types.map((type) => {
                const typeColor = colorForType(type);
                const typeShape = getShape(type);
                return (
                  <button
                    key={type}
                    onClick={(e) => { e.stopPropagation(); openNewNodeModal(type, ctxMenu.flowX - 100, ctxMenu.flowY - 40); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "7px 14px", fontSize: 13, textAlign: "left",
                      background: "none", border: "none", cursor: "pointer", borderRadius: 6,
                      margin: "0 4px", boxSizing: "border-box",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = "rgba(0,0,0,0.04)")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = "none")}
                  >
                    <ShapeIcon shape={typeShape} color={typeColor} />
                    <span style={{ color: "#1d1d1f", fontWeight: 400 }}>
                      {type.replace(/_/g, " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {newDraft && (
        <Modal onClose={() => setNewDraft(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: colorForType(newDraft.type), flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#86868b" }}>
              New {newDraft.type.replace(/_/g, " ")}
            </span>
          </div>
          <label style={lbl}>Name</label>
          <input
            value={newDraft.label}
            onChange={(e) => setNewDraft({ ...newDraft, label: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") commitNewNode(); }}
            style={inp}
            placeholder={`e.g. "First Lien Term Loan" or "Wells Fargo"`}
            autoFocus
          />
          <label style={lbl}>Details (one per line)</label>
          <textarea
            value={newDraft.notes}
            onChange={(e) => setNewDraft({ ...newDraft, notes: e.target.value })}
            rows={3}
            style={{ ...inp, resize: "vertical" }}
            placeholder={`$975M\nBank of America Agent\nTerm Loan Lenders`}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
            <button onClick={() => setNewDraft(null)} style={{ ...btnStyle, background: "white", color: "#1d1d1f", boxShadow: "0 0 0 1px rgba(0,0,0,0.1)" }}>Cancel</button>
            <button onClick={commitNewNode} style={btnStyle}>Add to Canvas</button>
          </div>
        </Modal>
      )}

      {editNode && (
        <Modal onClose={() => setEditNode(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: colorForType(editNode.type), flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#86868b" }}>
              Edit Node
            </span>
          </div>
          <label style={lbl}>Name</label>
          <input value={editNode.label} onChange={(e) => setEditNode({ ...editNode, label: e.target.value })} style={inp} autoFocus />
          <label style={lbl}>Type</label>
          <select
            value={editNode.type}
            onChange={(e) => setEditNode({ ...editNode, type: e.target.value })}
            style={{ ...inp, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%2386868b' stroke-width='1.5'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 28 }}
          >
            {NODE_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
          <label style={lbl}>Details (one per line)</label>
          <textarea
            value={editNode.notes}
            onChange={(e) => setEditNode({ ...editNode, notes: e.target.value })}
            rows={4}
            style={{ ...inp, resize: "vertical" }}
            placeholder={`$750M Roll-Up (3:1)\nWilmington SFS Agent\nAd Hoc / DIP Lenders`}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
            <button onClick={() => setEditNode(null)} style={{ ...btnStyle, background: "white", color: "#1d1d1f", boxShadow: "0 0 0 1px rgba(0,0,0,0.1)" }}>Cancel</button>
            <button onClick={saveNodeEdit} style={btnStyle}>Save</button>
          </div>
        </Modal>
      )}

      {editEdge && (
        <Modal onClose={() => setEditEdge(null)}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#86868b", marginBottom: 20 }}>
            Edit Connection
          </div>
          <label style={lbl}>Label</label>
          <textarea
            value={editEdge.label}
            onChange={(e) => setEditEdge({ ...editEdge, label: e.target.value })}
            rows={2}
            style={{ ...inp, resize: "vertical" }}
            placeholder='e.g. "3:1 Roll-Up ($750M)" or "Creeping Roll-Up"'
            autoFocus
          />
          <label style={lbl}>Style</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["solid", "dashed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setEditEdge({ ...editEdge, style: s })}
                style={{
                  ...btnStyle, flex: 1,
                  background: editEdge.style === s ? "#1d1d1f" : "white",
                  color: editEdge.style === s ? "white" : "#1d1d1f",
                  boxShadow: editEdge.style === s ? "none" : "0 0 0 1px rgba(0,0,0,0.1)",
                }}
              >{s}</button>
            ))}
          </div>
          <label style={lbl}>Color</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EDGE_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setEditEdge({ ...editEdge, color: c.value })}
                title={c.label}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: c.value, cursor: "pointer",
                  border: "none",
                  boxShadow: editEdge.color === c.value ? `0 0 0 2px white, 0 0 0 4px ${c.value}` : "0 0 0 1px rgba(0,0,0,0.08)",
                  transition: "box-shadow 0.15s",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
            <button onClick={() => setEditEdge(null)} style={{ ...btnStyle, background: "white", color: "#1d1d1f", boxShadow: "0 0 0 1px rgba(0,0,0,0.1)" }}>Cancel</button>
            <button onClick={saveEdgeEdit} style={btnStyle}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function DiagramCanvas({ data, onChange }: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner data={data} onChange={onChange} />
    </ReactFlowProvider>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.2)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 14, padding: 28, width: 420,
          maxHeight: "80vh", overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 500, color: "#86868b",
  marginBottom: 6, marginTop: 14,
  letterSpacing: "0.01em",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, color: "#1d1d1f",
  border: "none", borderRadius: 8, outline: "none", boxSizing: "border-box",
  background: "rgba(0,0,0,0.03)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  transition: "box-shadow 0.15s",
};
const btnStyle: React.CSSProperties = {
  padding: "9px 20px", fontSize: 13, fontWeight: 500,
  background: "#1d1d1f", color: "white", border: "none", borderRadius: 8,
  cursor: "pointer", transition: "opacity 0.15s",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
};
