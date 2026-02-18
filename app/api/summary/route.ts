import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are Professor Vincent Buccola at the University of Pennsylvania Carey Law School. Given a structured diagram of a corporate restructuring case AND source text passages from the original document, produce a concise case brief.

CRITICAL: You have access to SOURCE PASSAGES from the original document. For EVERY claim you make, you MUST cite the specific chunk(s) that support it using the format [CHUNK X] inline in your text. This is a legal analysis tool — every assertion needs a source.

Return JSON with EXACTLY these 11 fields. Text fields should each be 2-4 sentences max — precise, authoritative, no filler. Include [CHUNK X] citations inline.

{
  "overview": "What the company is, what it does (be specific about the business — trucking, warehousing, LTL, etc.), who the equity sponsor is, what the acquisition looked like (purchase price, leverage), when the key events happened. [CHUNK X]",
  "capitalStructure": "The prepetition debt stack: each facility, $ amounts, lien positions, who the agents are, key terms (cov-lite, maintenance covenants, sacred rights). Note what collateral secures each tranche and the approximate enterprise value relative to total debt. [CHUNK X]",
  "distressTrigger": "What went wrong — deteriorating performance, covenant trips (especially maintenance covenants in the revolver), liquidity shortfalls, maturity walls, negative EBITDA. How much runway did the company have? What did the sponsor do first to buy time? [CHUNK X]",
  "transactionMechanics": "Step by step: what type of LME. What assets were dropped down. How super senior paper was created. How non-pro-rata treatment was achieved. What the excluded lenders are stuck with. Note any 'gilding the lily.' [CHUNK X]",
  "keyContractTerms": "The specific contract provisions at issue: sacred rights, blockers, grace period manipulation, 'internally generated funds' limitation. Required lender vs unanimous consent thresholds. [CHUNK X]",
  "legalDisputes": "What theories the excluded lenders are asserting. The integrated transaction doctrine angle. Note the anti-evasion argument. [CHUNK X]",
  "courtRuling": "What the court actually held. Quote or paraphrase the key reasoning. Which claims survived, which were dismissed. [CHUNK X]",
  "outcomeSignificance": "What happened — ruling, settlement, bankruptcy filing, forum selection. Why this case matters for the market. [CHUNK X]",
  "buccolaTake": "Write 2-3 sentences EXACTLY as Professor Buccola would say them in class — conversational, intellectually sharp, with real personality. He talks like this: 'They shouldn't have done that. I mean, I love it — it's creative — but this is gilding the lily.' Or: 'The only reason they're doing a double dip on top of the drop down is they don't have enough asset capacity. That's the whole game.' Be SPECIFIC to this case. Reference actual dollar amounts and provisions. Do not be generic.",
  "keyFigures": [
    { "label": "Enterprise Value", "value": "~$X.XB", "category": "amount" },
    { "label": "Total Debt", "value": "$X.XB", "category": "amount" },
    { "label": "Sponsor", "value": "Firm Name", "category": "party" }
  ],
  "debtStack": [
    { "name": "Term Loan", "amount": "$725M", "lienPosition": "1st Lien", "agent": "Antares Capital", "notes": "Cov-lite." }
  ]
}

CITATION RULES:
1. Use [CHUNK X] format where X is the chunk number from the SOURCE PASSAGES
2. Place citations at the end of the specific sentence or clause they support
3. Every factual claim (dollar amounts, dates, party names, legal holdings) MUST have a citation
4. If multiple chunks support one claim, cite all: [CHUNK 3][CHUNK 7]
5. The buccolaTake field does NOT need citations — it's opinion
6. keyFigures and debtStack do NOT need inline citations

keyFigures: 8-14 items. Extract EVERY dollar amount, asset value, key party, important date, and critical legal/financial term.
debtStack: List every debt facility ordered by priority (senior to junior). Include pre- and post-transaction facilities.

Be direct. Use dollar amounts everywhere. Name specific provisions, doctrines, and agents.

Return only valid JSON, no markdown.`;

interface SummaryPayload {
  graph: {
    caseName: string;
    nodes: { id: string; label: string; type: string; notes: string }[];
    edges: { id: string; source: string; target: string; label: string }[];
  };
  sourceContext?: string;
  sectionHints?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SummaryPayload;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Missing or invalid data" }, { status: 400 });
    }

    const graph = body.graph ?? body;
    const sourceContext = body.sourceContext ?? "";
    const sectionHints = body.sectionHints ?? "";

    let userContent = `STRUCTURED DIAGRAM:\n${JSON.stringify(graph)}`;

    if (sourceContext) {
      userContent += `\n\n---\n\nSOURCE PASSAGES FROM ORIGINAL DOCUMENT:\n${sourceContext}`;
    }

    if (sectionHints) {
      userContent += `\n\n---\n\nSECTION → CHUNK RELEVANCE HINTS:\n${sectionHints}`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Summary failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
