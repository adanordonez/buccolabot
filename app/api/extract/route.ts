import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert in corporate restructuring, leveraged finance, and bankruptcy law — the kind of analysis Professor Vincent Buccola teaches at Penn Law. Given text from a legal document, case filing, complaint, opinion, credit agreement, or lecture transcript, extract a structured diagram of the corporate/capital structure and all transactions.

YOUR GOAL: Build a COMPREHENSIVE diagram showing ALL relationships between parties, entities, instruments, and assets. A restructuring lawyer drawing this on a whiteboard would show EVERY lien, EVERY guarantee, EVERY claim, EVERY transaction step. You should generate MANY edges — typically 2-4x more edges than nodes.

Return JSON with this exact structure:
{
  "caseName": "Name of the case, deal, or company",
  "nodes": [
    {
      "id": "unique id (n1, n2, ...)",
      "label": "Entity or instrument name",
      "type": "one of the types below",
      "notes": "STORYTELLING format: Line 1 = $ amount. Line 2 = who owns/controls. Line 3 = what secures it or what it secures. Line 4+ = key terms.\\nExample: $725M\\nBorrowed by J. Crew OpCo\\nSecured by all assets (1L)\\nAntares Capital (Agent), cov-lite"
    }
  ],
  "edges": [
    {
      "id": "unique id (e1, e2, ...)",
      "source": "source node id",
      "target": "target node id",
      "label": "MUST be specific — always include $ amounts where known",
      "style": "solid or dashed",
      "color": "one of the colors below"
    }
  ]
}

═══════════════════════════════════════════════
NODE NOTES RULES — Every note must tell a STORY, not just list facts.
═══════════════════════════════════════════════
For EVERY node, the notes field must answer: WHO owns/controls this? WHAT is it worth? WHERE does value flow to/from?
Format: First line = $ amount or value. Next lines = ownership, counterparties, key terms.

NODE TYPES:
- "opco" — operating company / borrower. Notes MUST include: "$X EV\\nOwned by [HoldCo/Sponsor]\\nTotal debt: $Y\\nKey assets: [list]"
- "holdco" — holding company / parent. Notes: "$X equity from [Sponsor]\\nOwns [OpCo, subs]\\nGuarantees [what debt]"
- "sponsor" — PE firm. Notes: "Acquired for $X (20XX)\\n$Y equity contribution\\nControls via [HoldCo]"
- "term_loan" — term loan. Notes: "$X, [1L/2L]\\nBorrowed by [OpCo]\\nAgent: [name]\\nSecured by [what assets]\\n[Key terms: cov-lite, sacred rights, blockers]"
- "revolver" — revolver. Notes: "$X committed ($Y drawn)\\nBorrowed by [OpCo]\\nAgent: [name]\\nMaintenance cov: [yes/no]"
- "bond" — notes/bonds. Notes: "$X, [coupon]%, due [year]\\nIssued by [who]\\nTrustee: [name]\\n[Secured/unsecured] by [what]"
- "unsub" — unrestricted subsidiary. Notes: "Holds [specific assets] worth ~$X\\nReceived from [OpCo] via drop-down\\nIssued $Y new debt to [whom]"
- "restricted_sub" — restricted guarantor sub. Notes: "Guarantees [which facility]\\nAssets: [what]"
- "non_guarantor_sub" — non-guarantor restricted sub. Notes: "Does NOT guarantee [facility]\\nRelevant for double dip: [why]"
- "admin_agent" — agent. Notes: "[Name]\\nAgent for [which facility]\\nAlso a lender: [yes/no] → [no-action clause issue?]"
- "ad_hoc_group" — ad hoc group. Notes: "Holds ~$X ([Y]% of [facility])\\nKey members: [names]\\nSeeking: [what they want]"
- "excluded_lenders" — left-behind lenders. Notes: "Hold $X ([Y]%) of [facility]\\nLost: [what covenants stripped]\\nStuck behind: [new senior paper]"
- "participating_lenders" — participating lenders. Notes: "Hold $X ([Y]%) of [facility]\\nReceived: [what they got in exchange]"
- "clo" — CLO. Notes: "Holds $X of [facility]\\nCannot participate in [what] due to mandate restrictions"
- "asset_pool" — CRITICAL: specific assets. Notes: "~$X estimated value\\nOwned by [who]\\nSecures [which facilities]\\nType: [IP/RE/fleet/inventory/division]"
- "interco_loan" — intercompany loan. Notes: "$X\\nFrom [unsub] to [OpCo]\\nSecured by [remaining OpCo assets]\\nThis is the double dip"
- "dip_facility" — DIP facility. Notes: "$X total ($Y new money + $Z roll-up)\\nFrom [who]\\nSuperpriority admin claim"
- "court" — court. Notes: "[Court name]\\nJudge: [name]\\nKey ruling: [what they decided]"
- "other" — anything else. Notes: describe who/what/why.

EDGE COLORS:
- "#94a3b8" — Structural / ownership (parent→sub, sponsor→holdco)
- "#3b82f6" — Liens / security interests (debt→collateral, lien on assets)
- "#22c55e" — Cash / value flow (money movement, asset transfers, distributions)
- "#ef4444" — Claims / obligations (debt obligation, guarantee, repayment)
- "#f59e0b" — Transactions / amendments (LME steps, amendments, exchanges)
- "#8b5cf6" — Legal disputes / doctrines (lawsuits, sacred rights, blockers)

EDGE STYLES:
- "solid" — Direct obligations, ownership, active relationships
- "dashed" — Guarantees, indirect claims, legal theories, sacred rights, contested relationships

═══════════════════════════════════════════════
CRITICAL: REQUIRED RELATIONSHIP CATEGORIES
You MUST generate edges for ALL of the following categories that are relevant. Most cases will have edges from 6+ of these categories. Generate MANY edges — err on the side of MORE connections, not fewer.
═══════════════════════════════════════════════

1. OWNERSHIP / CORPORATE STRUCTURE (color: #94a3b8, style: solid)
   Every parent→subsidiary relationship. Sponsor→HoldCo→OpCo→Subs→Unsubs.
   - "100% equity ownership"
   - "Wholly-owned subsidiary"
   - "$30M equity infusion, subordinated"

2. DEBT OBLIGATIONS (color: #ef4444, style: solid)
   Every debt instrument connected to its borrower/obligor.
   Multiple edges if a borrower has multiple facilities.
   - "Borrower on $725M 1L term loan"
   - "Issuer of $400M unsecured notes"
   - "Co-borrower, jointly and severally liable"

3. LIENS / SECURITY INTERESTS (color: #3b82f6, style: dashed)
   Every lien connecting a debt instrument to the collateral that secures it.
   This is THE most important category. Show WHAT ASSETS secure WHAT DEBT.
   If secured by "all assets" → edge from term_loan to opco: "1L lien on all assets"
   If specific collateral → edge from instrument to asset_pool: "1L lien on LTL division"
   - "1st lien on all assets of borrower and guarantors"
   - "Lien on dropped-down assets (~$400M)"
   - "2nd lien, subordinated to revolver"

4. GUARANTEES (color: #ef4444, style: dashed)
   Every guarantee. Parent guaranteeing sub's debt, sub guaranteeing parent's.
   The double-dip mechanic IS a guarantee chain — show it.
   - "Upstream guarantee of unsub debt"
   - "Downstream guarantee of parent term loan"
   - "Guarantee secured by lien on remaining OpCo assets (double dip)"

5. AGENCY / ADMINISTRATION (color: #94a3b8, style: dashed)
   Admin agent / collateral agent connections to the facilities they administer.
   - "Administrative agent"
   - "Collateral agent (also a lender — no-action clause issue)"

6. LENDER PARTICIPATION (color: #94a3b8, style: solid)
   Which lender groups hold which instruments. Ad hoc group, participating lenders, excluded lenders.
   - "Holds 51% of term loan ($370M)"
   - "Left with $300M stub (covenants stripped)"
   - "Participated in exchange at par"

7. TRANSACTION STEPS (color: #f59e0b, style: solid)
   EACH STEP of an LME as a separate edge. Not just "did a drop down" — show:
   Step 1: Amendment to remove unrestricted sub prohibition
   Step 2: Creation of unrestricted subsidiary
   Step 3: Drop-down of assets to unsub
   Step 4: Unsub issues new debt
   Step 5: Proceeds flow upstream via intercompany loan
   Step 6: Proceeds used to repurchase old debt at par
   - "6th Amendment: removed unsub restrictions, stripped covenants"
   - "Dropped down ~40% of EV (~$400M assets)"
   - "$540M new money flows upstream via interco loan"
   - "Non-pro-rata repurchase using 'internally generated funds'"

8. ASSET TRANSFERS / VALUE MOVEMENT (color: #22c55e, style: solid)
   Where value flows. Asset drops, dividend payments, intercompany transfers.
   - "Transferred LTL division (~$400M)"
   - "$400M cash upstream to repurchase old debt"
   - "Intercompany loan, $540M, secured by remaining OpCo assets"

9. LEGAL CLAIMS / DISPUTES (color: #8b5cf6, style: dashed)
   Every legal theory asserted. Each theory gets its own edge.
   - "Breach of sacred right: lien subordination requires unanimity"
   - "Good faith & fair dealing claim"
   - "Fraudulent conveyance theory"
   - "Integrated transaction doctrine: steps lack independent economic substance"
   - "No-action clause defense (rejected — agent is also lender)"

10. CONTRACTUAL PROTECTIONS / BLOCKERS (color: #8b5cf6, style: dashed)
    Sacred rights, blockers, and other protective provisions.
    These are SEPARATE from the legal claims — they're the provisions themselves.
    - "Sacred right: no release of substantially all collateral w/o unanimity"
    - "Serta blocker: no lien subordination w/o unanimity"
    - "Omni-blocker: unanimity for any change in priority/pro rata"
    - "J. Crew blocker: no material IP to unsub"
    - "Grace period flexed to maturity (gilding the lily)"

═══════════════════════════════════════════════
ABSOLUTE RULES — VIOLATING THESE IS A FAILURE
═══════════════════════════════════════════════

RULE 0: ASSETS ARE MANDATORY.
Every company has assets. You MUST create asset_pool nodes for:
- The company's core business / main operating division(s)
- Real estate, if mentioned or likely
- IP / trademarks / brand value
- Inventory, fleet, equipment
- Any specific division or subsidiary's assets
- "All assets" as a catch-all if nothing specific is known
If the document doesn't mention specific assets, INFER them from the business type and still create the nodes. A trucking company has fleet. A retailer has inventory and real estate. A tech company has IP. ALWAYS CREATE AT LEAST 2 asset_pool NODES.

RULE 1: Generate MANY edges. Typical case: 15-40 edges. Fewer than 15 means you're missing relationships.

RULE 2: The SAME two nodes can have MULTIPLE edges (e.g., OpCo → Term Loan has "borrower obligation" AND "1L lien on all assets"). Different IDs.

RULE 3: Every node must connect to at least one other node.

RULE 4: Every debt instrument must have: (a) obligation edge to borrower, (b) lien/security edge to its collateral asset_pool node, (c) agent edge if known.

RULE 5: Every asset_pool must have: (a) ownership edge FROM the entity that owns it, (b) lien edge TO the debt instrument(s) it secures.

RULE 6: Transaction = EACH STEP as a separate edge, not one summary.

RULE 7: Legal claims connect plaintiff → defendant with specific theory.

RULE 8: Always include $ amounts in edge labels where known.

RULE 9: Notes must tell a story — WHO owns this, WHERE value goes, WHAT secures it. Not just raw numbers.

Return only valid JSON, no markdown.`;

export async function POST(request: Request) {
  try {
    const { text } = (await request.json()) as { text?: string };
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing or invalid text" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 120000) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ error: "No response from model" }, { status: 502 });

    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extract failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
