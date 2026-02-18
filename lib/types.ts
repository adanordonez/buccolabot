export interface GraphNode {
  id: string;
  label: string;
  type: string;
  notes: string;
  x: number;
  y: number;
  color: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  style: "solid" | "dashed";
  color: string;
}

export interface GraphData {
  caseName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const TYPE_COLORS: Record<string, string> = {
  opco: "#f59e0b",
  holdco: "#d97706",
  sponsor: "#8b5cf6",
  term_loan: "#3b82f6",
  revolver: "#06b6d4",
  bond: "#6366f1",
  unsub: "#ef4444",
  restricted_sub: "#f97316",
  non_guarantor_sub: "#fb923c",
  admin_agent: "#64748b",
  ad_hoc_group: "#ec4899",
  excluded_lenders: "#dc2626",
  participating_lenders: "#22c55e",
  clo: "#0ea5e9",
  asset_pool: "#10b981",
  interco_loan: "#a855f7",
  dip_facility: "#14b8a6",
  court: "#78716c",
  debtor: "#f59e0b",
  creditor: "#3b82f6",
  asset: "#10b981",
  equity: "#8b5cf6",
  guarantor: "#ec4899",
  lender: "#06b6d4",
  subsidiary: "#f97316",
  parent: "#6366f1",
};

export function colorForType(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? "#64748b";
}

export function emptyGraph(): GraphData {
  return { caseName: "", nodes: [], edges: [] };
}

export interface KeyFigure {
  label: string;
  value: string;
  category: "amount" | "party" | "date" | "term" | "other";
}

export interface DebtFacility {
  name: string;
  amount: string;
  lienPosition: string;
  agent: string;
  notes: string;
}

export interface Citation {
  chunkId: number;
  text: string;
  score: number;
}

export interface CaseAnalysis {
  overview: string;
  capitalStructure: string;
  distressTrigger: string;
  transactionMechanics: string;
  keyContractTerms: string;
  legalDisputes: string;
  outcomeSignificance: string;
  courtRuling: string;
  buccolaTake: string;
  keyFigures: KeyFigure[];
  debtStack: DebtFacility[];
  citations: Record<string, Citation[]>;
}

export function emptyAnalysis(): CaseAnalysis {
  return {
    overview: "",
    capitalStructure: "",
    distressTrigger: "",
    transactionMechanics: "",
    keyContractTerms: "",
    legalDisputes: "",
    outcomeSignificance: "",
    courtRuling: "",
    buccolaTake: "",
    keyFigures: [],
    debtStack: [],
    citations: {},
  };
}

export const BRIEF_TABS = [
  {
    id: "overview" as const,
    label: "Overview",
    sections: [
      { key: "overview" as keyof CaseAnalysis, title: "Company" },
      { key: "capitalStructure" as keyof CaseAnalysis, title: "Capital Structure" },
    ],
  },
  {
    id: "transaction" as const,
    label: "Transaction",
    sections: [
      { key: "distressTrigger" as keyof CaseAnalysis, title: "Distress Trigger" },
      { key: "transactionMechanics" as keyof CaseAnalysis, title: "Mechanics" },
    ],
  },
  {
    id: "legal" as const,
    label: "Legal",
    sections: [
      { key: "keyContractTerms" as keyof CaseAnalysis, title: "Key Terms" },
      { key: "legalDisputes" as keyof CaseAnalysis, title: "Disputes" },
      { key: "courtRuling" as keyof CaseAnalysis, title: "Court Ruling" },
      { key: "outcomeSignificance" as keyof CaseAnalysis, title: "Outcome" },
    ],
  },
];

export const ANALYSIS_SECTIONS: { key: keyof CaseAnalysis; title: string }[] = [
  { key: "overview", title: "Company Overview" },
  { key: "capitalStructure", title: "Capital Structure" },
  { key: "distressTrigger", title: "What Went Wrong" },
  { key: "transactionMechanics", title: "Transaction Mechanics" },
  { key: "keyContractTerms", title: "Key Contract Terms" },
  { key: "legalDisputes", title: "Legal Disputes" },
  { key: "outcomeSignificance", title: "Outcome & Significance" },
];

export const NODE_TYPE_GROUPS = [
  {
    label: "CORPORATE STRUCTURE",
    types: ["opco", "holdco", "sponsor", "restricted_sub", "non_guarantor_sub", "unsub"],
  },
  {
    label: "DEBT INSTRUMENTS",
    types: ["term_loan", "revolver", "bond", "dip_facility", "interco_loan"],
  },
  {
    label: "PARTIES",
    types: ["admin_agent", "ad_hoc_group", "participating_lenders", "excluded_lenders", "clo", "court"],
  },
  {
    label: "OTHER",
    types: ["asset_pool", "debtor", "creditor", "lender", "guarantor", "other"],
  },
];
