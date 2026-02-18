"use client";

import { useState } from "react";
import type { CaseAnalysis, KeyFigure, DebtFacility, Citation } from "@/lib/types";
import { BRIEF_TABS } from "@/lib/types";

interface Props {
  analysis: CaseAnalysis;
  caseName: string;
  onClose: () => void;
  onAnalysisChange: (updated: CaseAnalysis) => void;
}

type TabId = "overview" | "transaction" | "legal" | "figures" | "notes";

const CATEGORY_STYLE: Record<string, { bg: string; fg: string }> = {
  amount: { bg: "rgba(59,130,246,0.06)", fg: "#2563eb" },
  party: { bg: "rgba(139,92,246,0.06)", fg: "#7c3aed" },
  date: { bg: "rgba(245,158,11,0.06)", fg: "#d97706" },
  term: { bg: "rgba(16,185,129,0.06)", fg: "#059669" },
  other: { bg: "rgba(100,116,139,0.06)", fg: "#475569" },
};

const LIEN_COLOR: Record<string, string> = {
  "super senior": "#dc2626",
  "dip": "#dc2626",
  "1st lien": "#2563eb",
  "first lien": "#2563eb",
  "2nd lien": "#7c3aed",
  "second lien": "#7c3aed",
  "unsecured": "#d97706",
  "subordinated": "#f97316",
  "mezzanine": "#ec4899",
};

function lienColor(pos: string): string {
  const lower = pos.toLowerCase();
  for (const [key, color] of Object.entries(LIEN_COLOR)) {
    if (lower.includes(key)) return color;
  }
  return "#64748b";
}

const F = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif";

export function CaseBriefPanel({ analysis, caseName, onClose, onAnalysisChange }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [notes, setNotes] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());

  const hasDebt = analysis.debtStack.length > 0;
  const hasFigures = analysis.keyFigures.length > 0;
  const hasBuccolaTake = !!analysis.buccolaTake;
  const hasCitations = Object.keys(analysis.citations).length > 0;

  const allTabs: { id: TabId; label: string }[] = [
    ...BRIEF_TABS.map((t) => ({ id: t.id as TabId, label: t.label })),
    ...(hasFigures || hasDebt ? [{ id: "figures" as TabId, label: "Figures" }] : []),
    { id: "notes" as TabId, label: "Notes" },
  ];

  const briefTab = BRIEF_TABS.find((t) => t.id === activeTab);

  const updateField = (key: keyof CaseAnalysis, value: string) => {
    onAnalysisChange({ ...analysis, [key]: value });
  };

  const toggleCitation = (sectionKey: string) => {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  return (
    <div style={{
      width: 400, flexShrink: 0,
      borderLeft: "1px solid rgba(0,0,0,0.06)",
      background: "#f5f5f7",
      display: "flex", flexDirection: "column",
      fontFamily: F,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "20px 20px 0",
        background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "#86868b", marginBottom: 3,
            }}>
              Case Brief
              {hasCitations && (
                <span style={{
                  marginLeft: 6, fontSize: 9, fontWeight: 600,
                  color: "#059669", background: "rgba(16,185,129,0.08)",
                  padding: "1px 5px", borderRadius: 3, letterSpacing: "0.03em",
                  verticalAlign: "middle",
                }}>
                  RAG
                </span>
              )}
            </div>
            {caseName && (
              <div style={{ fontSize: 17, fontWeight: 600, color: "#1d1d1f", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                {caseName}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "50%",
              cursor: "pointer", color: "#86868b", fontSize: 13, lineHeight: 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
          >
            ×
          </button>
        </div>

        <div style={{
          display: "flex", gap: 1,
          background: "rgba(0,0,0,0.05)", borderRadius: 8, padding: 2,
          marginBottom: -1,
        }}>
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 500,
                border: "none", borderRadius: 7, cursor: "pointer",
                transition: "all 0.2s ease",
                background: activeTab === tab.id ? "white" : "transparent",
                color: activeTab === tab.id ? "#1d1d1f" : "#86868b",
                boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                fontFamily: F,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 24px" }}>

        {hasBuccolaTake && activeTab === "overview" && (
          <div style={{
            background: "white", borderRadius: 12, overflow: "hidden",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", gap: 12, padding: "14px 16px" }}>
              <img
                src="/Buccola_Vincent_001.jpg"
                alt="Prof. Buccola"
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  objectFit: "cover", objectPosition: "center top",
                  flexShrink: 0, border: "2px solid rgba(0,0,0,0.06)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>Prof. Buccola</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                    textTransform: "uppercase", color: "#007aff",
                    background: "rgba(0,122,255,0.08)", padding: "2px 6px", borderRadius: 4,
                  }}>
                    Hot Take
                  </span>
                </div>
                <div style={{
                  fontSize: 13, color: "#424245", lineHeight: 1.55,
                  fontStyle: "italic", letterSpacing: "-0.003em",
                }}>
                  {analysis.buccolaTake}
                </div>
              </div>
            </div>
          </div>
        )}

        {briefTab && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {briefTab.sections.map((section) => {
              const text = analysis[section.key];
              const isEditing = editingSection === section.key;
              const isEmpty = !text || typeof text !== "string" || text === "Not available from source material.";
              const sectionCitations = analysis.citations[section.key] ?? [];
              const hasSectionCitations = sectionCitations.length > 0;
              const isExpanded = expandedCitations.has(section.key);

              return (
                <div
                  key={section.key}
                  style={{
                    background: "white", borderRadius: 12, overflow: "hidden",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px 0",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                        textTransform: "uppercase", color: "#86868b",
                      }}>
                        {section.title}
                      </span>
                      {hasSectionCitations && (
                        <span style={{
                          fontSize: 9, fontWeight: 600, color: "#059669",
                          background: "rgba(16,185,129,0.08)",
                          padding: "1px 5px", borderRadius: 3,
                        }}>
                          {sectionCitations.length} source{sectionCitations.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingSection(isEditing ? null : section.key)}
                      style={{
                        fontSize: 11, fontWeight: 500, color: isEditing ? "#007aff" : "#aeaeb2",
                        background: "none", border: "none", cursor: "pointer",
                        padding: "2px 6px", borderRadius: 4, transition: "color 0.15s",
                      }}
                    >
                      {isEditing ? "Done" : "Edit"}
                    </button>
                  </div>
                  <div style={{ padding: "8px 16px 14px" }}>
                    {isEditing ? (
                      <textarea
                        value={typeof text === "string" ? text : ""}
                        onChange={(e) => updateField(section.key, e.target.value)}
                        style={{
                          width: "100%", minHeight: 80, padding: 0,
                          border: "none", outline: "none", resize: "vertical",
                          fontSize: 13, lineHeight: 1.6, color: "#1d1d1f",
                          fontFamily: F, background: "transparent",
                          letterSpacing: "-0.003em",
                        }}
                        autoFocus
                        placeholder="Add your analysis here..."
                      />
                    ) : isEmpty ? (
                      <div
                        onClick={() => setEditingSection(section.key)}
                        style={{ fontSize: 13, color: "#c7c7cc", lineHeight: 1.6, cursor: "pointer", fontStyle: "italic" }}
                      >
                        Click to add notes...
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#1d1d1f", lineHeight: 1.65, fontWeight: 400, letterSpacing: "-0.003em" }}>
                        {formatText(text as string)}
                      </div>
                    )}
                  </div>

                  {hasSectionCitations && !isEditing && (
                    <div style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                      <button
                        onClick={() => toggleCitation(section.key)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 16px",
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 11, fontWeight: 500, color: "#059669",
                          fontFamily: F, textAlign: "left",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(16,185,129,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{
                          display: "inline-block", transition: "transform 0.2s",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          fontSize: 10,
                        }}>
                          ▶
                        </span>
                        {isExpanded ? "Hide" : "View"} source evidence
                      </button>

                      {isExpanded && (
                        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {sectionCitations.map((cite, i) => (
                            <CitationBlock key={cite.chunkId} citation={cite} index={i} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "overview" && hasDebt && (
          <div style={{
            background: "white", borderRadius: 12, overflow: "hidden",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
            marginTop: 12,
          }}>
            <div style={{
              padding: "12px 16px 8px",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
              textTransform: "uppercase", color: "#86868b",
            }}>
              Debt Stack
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: F,
              }}>
                <thead>
                  <tr style={{ borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <th style={thStyle}>Facility</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={thStyle}>Priority</th>
                    <th style={thStyle}>Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.debtStack.map((d, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500, color: "#1d1d1f" }}>{d.name}</div>
                        {d.notes && <div style={{ fontSize: 10, color: "#86868b", marginTop: 2, lineHeight: 1.3 }}>{d.notes}</div>}
                      </td>
                      <td style={{
                        ...tdStyle, textAlign: "right", fontWeight: 600, color: "#2563eb",
                        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                      }}>
                        {d.amount}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, color: lienColor(d.lienPosition),
                          background: lienColor(d.lienPosition) + "10",
                          padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap",
                        }}>
                          {d.lienPosition}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#6e6e73", fontSize: 11 }}>{d.agent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "figures" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {hasDebt && <DebtTable facilities={analysis.debtStack} />}
            {hasFigures && (
              <>
                <FigureGroup label="Amounts" figures={analysis.keyFigures.filter((f) => f.category === "amount")} />
                <FigureGroup label="Parties" figures={analysis.keyFigures.filter((f) => f.category === "party")} />
                <FigureGroup label="Dates" figures={analysis.keyFigures.filter((f) => f.category === "date")} />
                <FigureGroup label="Terms & Provisions" figures={analysis.keyFigures.filter((f) => f.category === "term" || f.category === "other")} />
              </>
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <div style={{
            background: "white", borderRadius: 12,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
            minHeight: 300, overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px 0",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
              textTransform: "uppercase", color: "#86868b",
            }}>
              Your Notes
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Questions for class, additional analysis, or observations..."
                style={{
                  width: "100%", minHeight: 260, padding: 0,
                  border: "none", outline: "none", resize: "vertical",
                  fontSize: 13, lineHeight: 1.65, color: "#1d1d1f",
                  fontFamily: F, background: "transparent",
                  letterSpacing: "-0.003em",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CitationBlock({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const preview = citation.text.slice(0, 120) + (citation.text.length > 120 ? "..." : "");
  const confidence = Math.round(citation.score * 100);

  return (
    <div style={{
      background: "rgba(16,185,129,0.03)",
      borderRadius: 8,
      border: "1px solid rgba(16,185,129,0.12)",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "flex-start", gap: 8,
          padding: "8px 12px",
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left", fontFamily: F,
        }}
      >
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#059669",
          background: "rgba(16,185,129,0.1)",
          padding: "2px 6px", borderRadius: 4,
          flexShrink: 0, marginTop: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          #{citation.chunkId}
        </span>
        <span style={{
          fontSize: 11, color: "#424245", lineHeight: 1.5,
          flex: 1,
        }}>
          {expanded ? "" : preview}
        </span>
        {confidence > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 600, color: "#86868b",
            flexShrink: 0, marginTop: 2,
          }}>
            {confidence}%
          </span>
        )}
      </button>
      {expanded && (
        <div style={{
          padding: "0 12px 10px 32px",
          fontSize: 12, color: "#1d1d1f", lineHeight: 1.6,
          fontStyle: "italic", letterSpacing: "-0.003em",
          borderTop: "1px solid rgba(16,185,129,0.08)",
          paddingTop: 8,
        }}>
          &ldquo;{highlightDollars(citation.text)}&rdquo;
        </div>
      )}
    </div>
  );
}

function highlightDollars(text: string): React.ReactNode[] {
  const parts = text.split(/(\$[\d,.]+[BMK]?(?:\s*(?:billion|million))?)/gi);
  return parts.map((part, i) => {
    if (/^\$[\d,.]+[BMK]?(?:\s*(?:billion|million))?$/i.test(part)) {
      return (
        <span key={i} style={{ fontWeight: 600, color: "#2563eb", fontStyle: "normal", fontVariantNumeric: "tabular-nums" }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

function DebtTable({ facilities }: { facilities: DebtFacility[] }) {
  if (facilities.length === 0) return null;
  return (
    <div style={{
      background: "white", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        padding: "12px 16px 8px",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        textTransform: "uppercase", color: "#86868b",
      }}>
        Capital Structure
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: F }}>
          <thead>
            <tr style={{ borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <th style={thStyle}>Facility</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              <th style={thStyle}>Priority</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((d, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, color: "#1d1d1f" }}>{d.name}</div>
                  {d.agent && <div style={{ fontSize: 10, color: "#86868b", marginTop: 1 }}>{d.agent}</div>}
                </td>
                <td style={{
                  ...tdStyle, textAlign: "right", fontWeight: 600, color: "#2563eb",
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                }}>
                  {d.amount}
                </td>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: lienColor(d.lienPosition),
                    background: lienColor(d.lienPosition) + "10",
                    padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap",
                  }}>
                    {d.lienPosition}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FigureGroup({ label, figures }: { label: string; figures: KeyFigure[] }) {
  if (figures.length === 0) return null;
  return (
    <div style={{
      background: "white", borderRadius: 12,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px 8px",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        textTransform: "uppercase", color: "#86868b",
      }}>
        {label}
      </div>
      {figures.map((fig, i) => {
        const cs = CATEGORY_STYLE[fig.category] ?? CATEGORY_STYLE.other;
        return (
          <div
            key={i}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "9px 16px",
              borderTop: "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <span style={{ fontSize: 13, color: "#424245", fontWeight: 400, fontFamily: F }}>{fig.label}</span>
            <span style={{
              fontSize: 12, fontWeight: 600, color: cs.fg,
              background: cs.bg, padding: "3px 10px", borderRadius: 6,
              fontVariantNumeric: "tabular-nums", fontFamily: F,
            }}>
              {fig.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatText(text: string): React.ReactNode[] {
  const parts = text.split(/(\$[\d,.]+[BMK]?(?:\s*(?:billion|million))?)/gi);
  return parts.map((part, i) => {
    if (/^\$[\d,.]+[BMK]?(?:\s*(?:billion|million))?$/i.test(part)) {
      return (
        <span key={i} style={{ fontWeight: 600, color: "#2563eb", fontVariantNumeric: "tabular-nums" }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

const thStyle: React.CSSProperties = {
  padding: "8px 16px", textAlign: "left", fontSize: 10, fontWeight: 600,
  letterSpacing: "0.04em", textTransform: "uppercase", color: "#86868b",
  fontFamily: F,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px", verticalAlign: "top", fontFamily: F,
};
