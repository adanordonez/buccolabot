"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { GraphNode, GraphEdge, GraphData } from "@/lib/types";
import { colorForType, NODE_TYPE_GROUPS } from "@/lib/types";

interface Props {
  data: GraphData;
  onChange: (data: GraphData) => void;
}

interface DragState { nodeId: string; offsetX: number; offsetY: number }
interface ConnectState { sourceId: string; x: number; y: number }
interface ContextMenuState { x: number; y: number; canvasX: number; canvasY: number }
interface EditNodeState { nodeId: string; label: string; type: string; notes: string }
interface EditEdgeState { edgeId: string; label: string; style: "solid" | "dashed"; color: string }

const NODE_W = 220;
const NODE_H = 80;

function nodeCenter(n: GraphNode) {
  return { cx: n.x + NODE_W / 2, cy: n.y + NODE_H / 2 };
}

function edgePath(src: GraphNode, tgt: GraphNode) {
  const s = nodeCenter(src);
  const t = nodeCenter(tgt);
  const dx = t.cx - s.cx;
  const dy = t.cy - s.cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return `M ${s.cx} ${s.cy} C ${s.cx + dx * 0.4} ${s.cy}, ${t.cx - dx * 0.4} ${t.cy}, ${t.cx} ${t.cy}`;
  }
  return `M ${s.cx} ${s.cy} C ${s.cx} ${s.cy + dy * 0.4}, ${t.cx} ${t.cy - dy * 0.4}, ${t.cx} ${t.cy}`;
}

const EDGE_COLORS = [
  { value: "#22c55e", label: "Cash/value flow" },
  { value: "#ef4444", label: "Claims/obligations" },
  { value: "#3b82f6", label: "Liens/security" },
  { value: "#94a3b8", label: "Structural/ownership" },
  { value: "#f59e0b", label: "Transactions/amendments" },
  { value: "#8b5cf6", label: "Legal arguments" },
];

export function DiagramCanvas({ data, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<ConnectState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [editingNode, setEditingNode] = useState<EditNodeState | null>(null);
  const [editingEdge, setEditingEdge] = useState<EditEdgeState | null>(null);

  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (sx - rect.left - pan.x) / zoom, y: (sy - rect.top - pan.y) / zoom };
    },
    [pan, zoom],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<GraphNode>) => {
      onChange({ ...data, nodes: data.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    },
    [data, onChange],
  );

  const updateEdge = useCallback(
    (id: string, patch: Partial<GraphEdge>) => {
      onChange({ ...data, edges: data.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    },
    [data, onChange],
  );

  const addNode = useCallback(
    (type: string, x: number, y: number) => {
      const id = `n${Date.now()}`;
      const node: GraphNode = { id, label: "New " + type.replace(/_/g, " "), type, notes: "", x, y, color: colorForType(type) };
      onChange({ ...data, nodes: [...data.nodes, node] });
    },
    [data, onChange],
  );

  const addEdge = useCallback(
    (source: string, target: string) => {
      if (source === target) return;
      const exists = data.edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source));
      if (exists) return;
      const edge: GraphEdge = { id: `e${Date.now()}`, source, target, label: "", style: "solid", color: "#94a3b8" };
      onChange({ ...data, edges: [...data.edges, edge] });
      setTimeout(() => setEditingEdge({ edgeId: edge.id, label: "", style: "solid", color: "#94a3b8" }), 50);
    },
    [data, onChange],
  );

  const deleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    onChange({
      ...data,
      nodes: data.nodes.filter((n) => !selected.has(n.id)),
      edges: data.edges.filter((e) => !selected.has(e.source) && !selected.has(e.target)),
    });
    setSelected(new Set());
  }, [data, onChange, selected]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNode || editingEdge) return;
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteSelected(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelected, editingNode, editingEdge]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const nz = Math.max(0.1, Math.min(4, zoom * factor));
        setPan({ x: mx - ((mx - pan.x) / zoom) * nz, y: my - ((my - pan.y) / zoom) * nz });
        setZoom(nz);
      } else {
        setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    },
    [pan, zoom],
  );

  const onMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (ctxMenu) { setCtxMenu(null); return; }
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setPanning({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y });
        e.preventDefault();
      } else if (e.button === 0) {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-node-id]") && !target.closest("[data-edge-id]")) {
          setSelected(new Set());
        }
      }
    },
    [pan, ctxMenu],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (panning) { setPan({ x: panning.panX + (e.clientX - panning.startX), y: panning.panY + (e.clientY - panning.startY) }); return; }
      if (drag) { const pos = screenToCanvas(e.clientX, e.clientY); updateNode(drag.nodeId, { x: pos.x - drag.offsetX, y: pos.y - drag.offsetY }); return; }
      if (connecting) { const pos = screenToCanvas(e.clientX, e.clientY); setConnecting({ ...connecting, x: pos.x, y: pos.y }); }
    },
    [panning, drag, connecting, screenToCanvas, updateNode],
  );

  const onMouseUp = useCallback(
    (e: ReactMouseEvent) => {
      if (panning) { setPanning(null); return; }
      if (drag) { setDrag(null); return; }
      if (connecting) {
        const target = (e.target as HTMLElement).closest("[data-node-id]");
        if (target) addEdge(connecting.sourceId, target.getAttribute("data-node-id")!);
        setConnecting(null);
      }
    },
    [panning, drag, connecting, addEdge],
  );

  const onContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      setCtxMenu({ x: e.clientX, y: e.clientY, canvasX: pos.x, canvasY: pos.y });
    },
    [screenToCanvas],
  );

  const isEditing = editingNode || editingEdge;

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={onContextMenu}
      style={{
        width: "100%", height: "100%", overflow: "hidden", position: "relative",
        background: "#fafafa", cursor: panning ? "grabbing" : drag ? "move" : "default", userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} width="1" height="1">
          <defs>
            {EDGE_COLORS.map((c) => (
              <marker key={c.value} id={`arrow-${c.value.slice(1)}`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c.value} />
              </marker>
            ))}
            <marker id="arrow-default" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          {data.edges.map((edge) => {
            const src = data.nodes.find((n) => n.id === edge.source);
            const tgt = data.nodes.find((n) => n.id === edge.target);
            if (!src || !tgt) return null;
            const markerId = EDGE_COLORS.find((c) => c.value === edge.color) ? `arrow-${edge.color.slice(1)}` : "arrow-default";
            return (
              <g key={edge.id} data-edge-id={edge.id}>
                <path
                  d={edgePath(src, tgt)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingEdge({ edgeId: edge.id, label: edge.label, style: edge.style, color: edge.color });
                  }}
                />
                <path
                  d={edgePath(src, tgt)}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={2}
                  strokeDasharray={edge.style === "dashed" ? "6 4" : undefined}
                  markerEnd={`url(#${markerId})`}
                  style={{ pointerEvents: "none" }}
                />
                {edge.label && (() => {
                  const sc = nodeCenter(src);
                  const tc = nodeCenter(tgt);
                  const mx = (sc.cx + tc.cx) / 2;
                  const my = (sc.cy + tc.cy) / 2;
                  return (
                    <g
                      style={{ pointerEvents: "auto", cursor: "pointer" }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingEdge({ edgeId: edge.id, label: edge.label, style: edge.style, color: edge.color });
                      }}
                    >
                      <rect x={mx - 80} y={my - 18} width={160} height={20} rx={4} fill="white" fillOpacity={0.92} />
                      <text x={mx} y={my - 4} textAnchor="middle" fill={edge.color} fontSize={10} fontWeight={600}>
                        {edge.label.length > 30 ? edge.label.slice(0, 30) + "..." : edge.label}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}
          {connecting && (() => {
            const src = data.nodes.find((n) => n.id === connecting.sourceId);
            if (!src) return null;
            const sc = nodeCenter(src);
            return <line x1={sc.cx} y1={sc.cy} x2={connecting.x} y2={connecting.y} stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 4" />;
          })()}
        </svg>

        {data.nodes.map((node) => (
          <div
            key={node.id}
            data-node-id={node.id}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              const pos = screenToCanvas(e.clientX, e.clientY);
              if (e.shiftKey) {
                setSelected((prev) => { const next = new Set(prev); next.has(node.id) ? next.delete(node.id) : next.add(node.id); return next; });
              } else {
                if (!selected.has(node.id)) setSelected(new Set([node.id]));
              }
              setDrag({ nodeId: node.id, offsetX: pos.x - node.x, offsetY: pos.y - node.y });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingNode({ nodeId: node.id, label: node.label, type: node.type, notes: node.notes });
            }}
            style={{
              position: "absolute", left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H,
              background: "white", borderRadius: 8,
              border: selected.has(node.id) ? "2px solid #3b82f6" : "1px solid #e2e8f0",
              borderLeft: `4px solid ${node.color}`,
              boxShadow: selected.has(node.id) ? "0 0 0 2px rgba(59,130,246,0.3)" : "0 1px 3px rgba(0,0,0,0.08)",
              cursor: "grab", overflow: "hidden", zIndex: selected.has(node.id) ? 10 : 1,
            }}
          >
            <div style={{ padding: "8px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{node.label}</div>
              <div style={{ fontSize: 10, color: node.color, fontWeight: 500, textTransform: "uppercase", marginTop: 2 }}>
                {node.type.replace(/_/g, " ")}
              </div>
              {node.notes && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>{node.notes}</div>
              )}
            </div>
            {[{ side: "right", pos: -6 }, { side: "left", pos: -6 }].map((h) => (
              <div
                key={h.side}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const p = screenToCanvas(e.clientX, e.clientY);
                  setConnecting({ sourceId: node.id, x: p.x, y: p.y });
                }}
                style={{
                  position: "absolute", [h.side]: h.pos, top: "50%", transform: "translateY(-50%)",
                  width: 12, height: 12, borderRadius: "50%", background: "#3b82f6",
                  border: "2px solid white", cursor: "crosshair", zIndex: 20,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 4, zIndex: 50 }}>
        <button onClick={() => setZoom((z) => Math.min(4, z * 1.2))} style={toolBtn}>+</button>
        <button onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))} style={toolBtn}>-</button>
        <button
          onClick={() => {
            if (data.nodes.length === 0) return;
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const minX = Math.min(...data.nodes.map((n) => n.x));
            const minY = Math.min(...data.nodes.map((n) => n.y));
            const maxX = Math.max(...data.nodes.map((n) => n.x + NODE_W));
            const maxY = Math.max(...data.nodes.map((n) => n.y + NODE_H));
            const gw = maxX - minX;
            const gh = maxY - minY;
            const pad = 60;
            const nz = Math.max(0.1, Math.min(2, Math.min((rect.width - pad * 2) / gw, (rect.height - pad * 2) / gh)));
            setPan({ x: rect.width / 2 - ((minX + maxX) / 2) * nz, y: rect.height / 2 - ((minY + maxY) / 2) * nz });
            setZoom(nz);
          }}
          style={toolBtn}
        >Fit</button>
      </div>

      {ctxMenu && (
        <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, background: "white", borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.12)", padding: "4px 0", zIndex: 100, minWidth: 200, maxHeight: 400, overflowY: "auto" }}>
          {NODE_TYPE_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{ padding: "6px 12px", fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>{group.label}</div>
              {group.types.map((type) => (
                <button
                  key={type}
                  onClick={() => { addNode(type, ctxMenu.canvasX - NODE_W / 2, ctxMenu.canvasY - NODE_H / 2); setCtxMenu(null); }}
                  style={{ display: "block", width: "100%", padding: "5px 12px", fontSize: 12, textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colorForType(type), marginRight: 8, verticalAlign: "middle" }} />
                  {type.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {editingNode && (
        <Modal onClose={() => setEditingNode(null)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Edit Node</div>
          <label style={lbl}>Label</label>
          <input value={editingNode.label} onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })} style={inp} />
          <label style={lbl}>Type</label>
          <input value={editingNode.type} onChange={(e) => setEditingNode({ ...editingNode, type: e.target.value })} style={inp} />
          <label style={lbl}>Notes</label>
          <textarea value={editingNode.notes} onChange={(e) => setEditingNode({ ...editingNode, notes: e.target.value })} rows={4} style={{ ...inp, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setEditingNode(null)} style={{ ...saveBtn, background: "white", color: "#18181b", border: "1px solid #e2e8f0" }}>Cancel</button>
            <button onClick={() => { updateNode(editingNode.nodeId, { label: editingNode.label, type: editingNode.type, notes: editingNode.notes, color: colorForType(editingNode.type) }); setEditingNode(null); }} style={saveBtn}>Save</button>
          </div>
        </Modal>
      )}

      {editingEdge && (
        <Modal onClose={() => setEditingEdge(null)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Edit Connection</div>
          <label style={lbl}>Label (describe the relationship)</label>
          <textarea
            value={editingEdge.label}
            onChange={(e) => setEditingEdge({ ...editingEdge, label: e.target.value })}
            rows={2}
            style={{ ...inp, resize: "vertical" }}
            placeholder='e.g. "1L term loan, $725M, secured by all assets"'
            autoFocus
          />
          <label style={lbl}>Style</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["solid", "dashed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setEditingEdge({ ...editingEdge, style: s })}
                style={{ ...saveBtn, flex: 1, background: editingEdge.style === s ? "#18181b" : "white", color: editingEdge.style === s ? "white" : "#18181b", border: "1px solid #e2e8f0" }}
              >{s}</button>
            ))}
          </div>
          <label style={lbl}>Color</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EDGE_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setEditingEdge({ ...editingEdge, color: c.value })}
                title={c.label}
                style={{
                  width: 28, height: 28, borderRadius: 6, background: c.value, border: editingEdge.color === c.value ? "3px solid #18181b" : "2px solid #e2e8f0", cursor: "pointer",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setEditingEdge(null)} style={{ ...saveBtn, background: "white", color: "#18181b", border: "1px solid #e2e8f0" }}>Cancel</button>
            <button onClick={() => { updateEdge(editingEdge.edgeId, { label: editingEdge.label, style: editingEdge.style, color: editingEdge.color }); setEditingEdge(null); }} style={saveBtn}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 24, width: 400, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
        {children}
      </div>
    </div>
  );
}

const toolBtn: React.CSSProperties = { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 4, marginTop: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" };
const saveBtn: React.CSSProperties = { padding: "8px 20px", fontSize: 13, fontWeight: 500, background: "#18181b", color: "white", border: "none", borderRadius: 6, cursor: "pointer" };
