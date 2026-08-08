// ---------------------------------------------------------------------------
// Legal notice draftsman.
//
// Builds a full pre-litigation notice under the Consumer Protection Act, 2019
// from a case record, following the structure of a conventional Indian legal
// notice: ref/date, mode of service, addressee, without-prejudice marking,
// numbered paragraphs establishing consumer status → facts → prior grievance →
// statutory characterisation → loss → demands → consequence, then the
// signature and a schedule of annexures.
//
// Design notes:
//
//  - The document is a flat, ordered list of blocks with stable ids. Every
//    block of body text is editable by the user; edits are stored as an
//    id → text map on the case, so re-drafting never silently discards them.
//  - Facts are built from the complainant's own account, split into
//    chronological sub-paragraphs, rather than dumped as a single italic
//    blob. A notice that recites facts specifically is the one that reads as
//    litigation-ready.
//  - Where the intake genuinely does not capture something a notice needs
//    (invoice number, mode of payment, the representations relied upon), the
//    draft carries an explicit [BRACKETED] placeholder. That is the standard
//    drafting convention and is honest — better than inventing a fact or
//    quietly omitting a limb of the claim.
// ---------------------------------------------------------------------------

import type { CaseView } from './caseStore'
import { characterisations, groundListLabel, readGrounds } from './grounds'
import { fmtDate, inr, noticeRef } from './caseStore'
import type { EvidenceFile } from './types'

export const COMPLIANCE_DAYS = 30

export type BlockKind =
  | 'ref' // ref/date line
  | 'mode' // service mode line
  | 'address' // To / And to blocks
  | 'marking' // WITHOUT PREJUDICE
  | 'title'
  | 'subject'
  | 'salutation'
  | 'para' // numbered paragraph
  | 'sub' // lettered/roman sub-paragraph
  | 'signature'
  | 'annexure-title'
  | 'annexure'

export interface NoticeBlock {
  id: string
  kind: BlockKind
  /** Rendered before the text: "1.", "(a)", "(iii)". */
  label?: string
  text: string
  /** Shown to the user in the editor when the block needs their attention. */
  hint?: string
  /** True when the text still contains an unfilled [PLACEHOLDER]. */
  needsInput?: boolean
}

export interface NoticeDoc {
  ref: string
  date: string
  subject: string
  title: string
  /** Recipient email, when we have one to draft to. */
  recipientEmail: string | null
  blocks: NoticeBlock[]
}

const PLACEHOLDER = /\[[A-Z][A-Z0-9 ./_—-]*\]/

/* -------------------------------------------------------------------------- */
/* Fact extraction                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Splits the complainant's account into sentence-sized chronological units so
 * each can become its own sub-paragraph. Abbreviations common in Indian
 * consumer complaints (Rs., No., Ltd., Pvt.) are protected from the split.
 */
export function splitNarrative(narrative: string, max = 6): string[] {
  const guarded = narrative
    .replace(/\b(Rs|No|Nos|Ltd|Pvt|Mr|Mrs|Ms|Dr|Sr|Jr|vs|v|approx|etc)\./gi, '$1<DOT>')
    .trim()

  const parts = guarded
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.replace(/<DOT>/g, '.').trim())
    .filter((s) => s.length > 0)

  if (parts.length <= max) return parts

  // Too many sentences: keep the first max-1 and fold the tail into one block
  // so nothing the complainant wrote is lost from the notice.
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join(' ')]
}

const ANNEXURE_LABELS: Record<EvidenceFile['category'], string> = {
  invoice: 'Invoice / order confirmation / proof of payment',
  photo: 'Photographs or screenshots evidencing the defect or deficiency',
  correspondence: 'Prior correspondence, complaints and grievance tickets',
  warranty: 'Warranty card, service agreement or terms relied upon',
  other: 'Further supporting documents',
}

/** One annexure entry per distinct evidence category actually uploaded. */
function annexureList(evidence: EvidenceFile[]): string[] {
  const seen = new Set<EvidenceFile['category']>()
  const out: string[] = []
  for (const e of evidence ?? []) {
    if (seen.has(e.category)) continue
    seen.add(e.category)
    out.push(ANNEXURE_LABELS[e.category])
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Draftsman                                                                  */
/* -------------------------------------------------------------------------- */

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

function commissionName(c: CaseView): string {
  switch (c.routing.commission) {
    case 'district':
      return `District Consumer Disputes Redressal Commission${c.intake.city ? `, ${c.intake.city}` : ''}`
    case 'state':
      return `State Consumer Disputes Redressal Commission, ${c.intake.state || '[STATE]'}`
    default:
      return 'National Consumer Disputes Redressal Commission, New Delhi'
  }
}

/**
 * Builds the notice for a case. `edits` (id → text) override generated text,
 * so a user's rewording survives every subsequent rebuild.
 */
export function buildNotice(c: CaseView, edits: Record<string, string> = {}): NoticeDoc {
  const grounds = readGrounds(c.intake)
  const claim = c.intake.claimAmount ?? 0
  const cons = c.intake.consequentialLoss ?? 0
  const total = claim + cons
  const company = c.intake.companyName || '[NAME OF THE COMPANY / OPPOSITE PARTY]'
  const noticeDate = c.notice?.sentAt ?? new Date().toISOString()
  const isGoods = grounds.some((g) =>
    ['defective_goods', 'spurious_goods', 'hazardous_goods', 'overcharging'].includes(g),
  )

  const blocks: NoticeBlock[] = []
  const push = (b: Omit<NoticeBlock, 'needsInput'>) => {
    const text = edits[b.id] ?? b.text
    blocks.push({ ...b, text, needsInput: PLACEHOLDER.test(text) })
  }

  /* --- Heading apparatus ------------------------------------------------- */

  push({
    id: 'ref',
    kind: 'ref',
    text: `Ref. No.: ${noticeRef(c.id)}          Date: ${fmtDate(noticeDate, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })}`,
  })

  push({
    id: 'mode',
    kind: 'mode',
    text: 'BY REGISTERED POST WITH A.D. / BY EMAIL',
  })

  push({
    id: 'to',
    kind: 'address',
    text: [
      'To,',
      'The Managing Director / The Authorised Signatory,',
      company,
      c.intake.companyAddress || '[REGISTERED OFFICE ADDRESS]',
      c.intake.companyEmail ? c.intake.companyEmail : '[EMAIL ADDRESS OF THE OPPOSITE PARTY]',
    ].join('\n'),
    hint: 'Address the registered office. For an online purchase, consider adding the seller and the platform as separate addressees; for manufactured goods, the seller and the manufacturer.',
  })

  push({ id: 'marking', kind: 'marking', text: 'WITHOUT PREJUDICE' })

  const title = 'LEGAL NOTICE UNDER THE CONSUMER PROTECTION ACT, 2019'
  push({ id: 'title', kind: 'title', text: title })

  const reliefWord = isGoods
    ? `refund the sum of ${inr(claim)} and/or replace the defective goods`
    : `refund the sum of ${inr(claim)} and/or rectify the deficiency in service`
  const subject = `Legal notice calling upon you to ${reliefWord}${
    cons > 0 ? `, and to pay compensation of ${inr(cons)},` : ''
  } on account of ${groundListLabel(grounds)} in respect of [BRIEF DESCRIPTION OF THE GOODS OR SERVICE], failing which appropriate legal proceedings shall be initiated against you, entirely at your risk as to costs and consequences.`
  push({
    id: 'subject',
    kind: 'subject',
    text: subject,
    hint: 'Name the goods or service in a few words — e.g. "one automatic washing machine, Model XYZ".',
  })

  push({ id: 'salutation', kind: 'salutation', text: 'Sir/Madam,' })

  /* --- 1. Capacity ------------------------------------------------------- */

  push({
    id: 'p1',
    kind: 'para',
    label: '1.',
    text: `I, ${c.intake.fullName || '[FULL NAME]'}, resident of ${
      [c.intake.city, c.intake.state].filter(Boolean).join(', ') || '[FULL ADDRESS]'
    }, the complainant herein, do hereby serve upon you this legal notice as follows:`,
    hint: 'The Act permits self-representation. If an advocate is issuing this on your behalf, replace with the "Under instructions from and on behalf of my client…" form and use the advocate signature block.',
  })

  /* --- 2. Consumer status ------------------------------------------------ */

  push({
    id: 'p2',
    kind: 'para',
    label: '2.',
    text: `I am a "consumer" within the meaning of Section 2(7) of the Consumer Protection Act, 2019 (hereinafter "the Act"), having ${
      isGoods ? 'purchased the goods' : 'availed the services'
    } described herein for personal use and for consideration duly paid. You are the ${
      isGoods ? 'manufacturer / seller' : 'service provider'
    } in respect of the said ${
      isGoods ? 'goods' : 'services'
    }, and are answerable in law for the acts, omissions and representations set out below.`,
  })

  /* --- 3. Facts ---------------------------------------------------------- */

  push({
    id: 'p3',
    kind: 'para',
    label: '3.',
    text: 'That the facts giving rise to this notice, in brief, are as follows:',
  })

  const facts: string[] = []
  facts.push(
    `On ${
      c.intake.transactionDate ? fmtDate(c.intake.transactionDate) : '[DATE OF TRANSACTION]'
    }, I ${isGoods ? 'purchased' : 'availed of'} ${
      isGoods ? '[DESCRIPTION OF THE GOODS]' : '[DESCRIPTION OF THE SERVICE]'
    } from you vide [INVOICE / ORDER / BOOKING No.] for a total consideration of ${inr(
      claim,
    )}, paid through [MODE OF PAYMENT].`,
  )
  facts.push(
    'At the time of the said transaction, you represented and assured me that [SET OUT THE REPRESENTATIONS, WARRANTIES OR SERVICE STANDARDS PROMISED].',
  )

  const narrativeFacts = splitNarrative(c.intake.narrative ?? '', 5)
  if (narrativeFacts.length > 0) {
    facts.push(...narrativeFacts)
  } else {
    facts.push('[SET OUT WHAT ACTUALLY HAPPENED — the defect or deficiency, with dates.]')
  }

  facts.forEach((text, i) => {
    push({
      id: `p3-${i}`,
      kind: 'sub',
      label: `(${LETTERS[i] ?? i + 1})`,
      text,
      hint:
        i >= 2
          ? 'Taken from your own account. Keep it factual and dated — specificity is what makes a notice strong; overstatement weakens it.'
          : undefined,
    })
  })

  /* --- 4. Prior grievance ------------------------------------------------ */

  const hasCorrespondence = (c.intake.evidence ?? []).some((e) => e.category === 'correspondence')
  push({
    id: 'p4',
    kind: 'para',
    label: '4.',
    text: `That on becoming aware of the aforesaid, I promptly took up the matter with you. On ${
      c.intake.incidentDate ? fmtDate(c.intake.incidentDate) : '[DATE(S)]'
    }, I ${
      hasCorrespondence
        ? 'wrote to you and raised a grievance seeking redressal'
        : '[wrote to you / lodged complaint No. ___ / called your customer care] seeking redressal'
    }. Despite the said communication(s), you have failed and neglected to redress the grievance, and the resolution promised was never provided, thereby compelling me to issue the present notice.`,
  })

  /* --- 5. Statutory characterisation (all pleaded grounds) --------------- */

  push({
    id: 'p5',
    kind: 'para',
    label: '5.',
    text: 'That your conduct, as set out above, squarely amounts to:',
  })

  characterisations(grounds).forEach((ch, i) => {
    push({
      id: `p5-${ch.key}`,
      kind: 'sub',
      label: `(${ROMAN[i] ?? i + 1})`,
      text: `${ch.text};`,
    })
  })

  /* --- 6. Loss ----------------------------------------------------------- */

  push({
    id: 'p6',
    kind: 'para',
    label: '6.',
    text: `That by reason of the aforesaid acts, omissions and defaults on your part, I have suffered actual financial loss to the tune of ${inr(
      total,
    )}${
      cons > 0 ? ` (being ${inr(claim)} paid as consideration and ${inr(cons)} in consequential loss)` : ''
    }, together with harassment, inconvenience and mental agony, for all of which you are squarely liable to compensate me.`,
  })

  /* --- 7. Demands -------------------------------------------------------- */

  push({
    id: 'p7',
    kind: 'para',
    label: '7.',
    text: `I, therefore, hereby call upon you to, within ${COMPLIANCE_DAYS} days of the receipt of this notice:`,
  })

  const demands: string[] = [
    `Refund the sum of ${inr(claim)} together with interest at [__]% per annum from ${
      c.intake.transactionDate ? fmtDate(c.intake.transactionDate) : '[DATE]'
    } till realisation; and/or`,
    isGoods
      ? 'Replace the defective goods with goods conforming to the standard represented and warranted; and'
      : 'Rectify and make good the deficiency in service, and render the service as originally promised; and',
  ]
  if (cons > 0) {
    demands.push(
      `Pay a sum of ${inr(
        cons,
      )} towards compensation for the loss, harassment, inconvenience and mental agony suffered by me; and`,
    )
  } else {
    demands.push(
      'Pay a sum of [AMOUNT] towards compensation for the loss, harassment, inconvenience and mental agony suffered by me; and',
    )
  }
  demands.push('Pay a sum of [AMOUNT] towards the costs of and incidental to this notice.')

  demands.forEach((text, i) => {
    push({ id: `p7-${i}`, kind: 'sub', label: `(${LETTERS[i]})`, text })
  })

  /* --- 8-10. Consequence, reservation, record ---------------------------- */

  push({
    id: 'p8',
    kind: 'para',
    label: '8.',
    text: `TAKE NOTICE that should you fail or neglect to comply with the aforesaid demands within the time stipulated, I shall be constrained to initiate appropriate legal proceedings against you before the ${commissionName(
      c,
    )} under the Consumer Protection Act, 2019, and/or before any other competent forum, seeking the reliefs aforesaid along with interest, compensation and costs, entirely at your risk, cost and consequences, and for all of which you alone shall be held responsible.`,
  })

  push({
    id: 'p9',
    kind: 'para',
    label: '9.',
    text: 'That this notice is issued without prejudice to any other rights and remedies available to me in law or in equity, all of which are expressly reserved.',
  })

  push({
    id: 'p10',
    kind: 'para',
    label: '10.',
    text: 'A copy of this notice is retained for future reference and production, if required.',
  })

  push({
    id: 'signature',
    kind: 'signature',
    text: [
      'Yours faithfully,',
      '',
      '',
      c.intake.fullName || '[NAME OF THE COMPLAINANT]',
      [c.intake.city, c.intake.state].filter(Boolean).join(', ') || '[ADDRESS]',
      [c.intake.phone, c.intake.email].filter(Boolean).join(' · ') || '[CONTACT]',
    ].join('\n'),
    hint: 'Sign above your name before dispatch. If an advocate is issuing this, substitute their name, enrolment number and office address.',
  })

  /* --- Annexures --------------------------------------------------------- */

  const annexures = annexureList(c.intake.evidence ?? [])
  if (annexures.length > 0) {
    push({ id: 'ann-title', kind: 'annexure-title', text: 'LIST OF ANNEXURES' })
    annexures.forEach((a, i) => {
      push({ id: `ann-${i}`, kind: 'annexure', label: `Annexure ${i + 1}:`, text: a })
    })
  }

  return {
    ref: noticeRef(c.id),
    date: fmtDate(noticeDate),
    subject,
    title,
    recipientEmail: c.intake.companyEmail || null,
    blocks,
  }
}

/* -------------------------------------------------------------------------- */
/* Renderers                                                                  */
/* -------------------------------------------------------------------------- */

/** Plain-text rendering — used for the email body and the clipboard copy. */
export function noticeToText(doc: NoticeDoc): string {
  const out: string[] = []
  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'title':
      case 'marking':
      case 'annexure-title':
        out.push('', b.text, '')
        break
      case 'subject':
        out.push(`Sub: ${b.text}`, '')
        break
      case 'sub':
        out.push(`     ${b.label} ${b.text}`)
        break
      case 'para':
        out.push('', `${b.label} ${b.text}`)
        break
      case 'annexure':
        out.push(`  ${b.label} ${b.text}`)
        break
      case 'signature':
        out.push('', b.text)
        break
      default:
        out.push(b.text)
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** True when any block still carries an unfilled [PLACEHOLDER]. */
export function outstandingPlaceholders(doc: NoticeDoc): NoticeBlock[] {
  return doc.blocks.filter((b) => b.needsInput)
}

/* -------------------------------------------------------------------------- */
/* Email draft                                                                */
/* -------------------------------------------------------------------------- */

export interface EmailDraft {
  to: string
  subject: string
  body: string
  /** mailto: URL — opens the user's own mail client with everything prefilled. */
  mailto: string
}

export function buildEmailDraft(c: CaseView, doc: NoticeDoc): EmailDraft {
  const to = doc.recipientEmail ?? ''
  const subject = `Legal Notice under the Consumer Protection Act, 2019 — ${doc.ref} — ${
    c.intake.fullName || 'Complainant'
  } v. ${c.intake.companyName || 'Opposite Party'}`

  const body = [
    'Dear Sir/Madam,',
    '',
    `Please find enclosed a legal notice under the Consumer Protection Act, 2019, bearing reference ${doc.ref}, issued in respect of the matter set out therein.`,
    '',
    `You are called upon to comply with the demands set out in the notice within ${COMPLIANCE_DAYS} days of receipt. A copy is also being dispatched by Registered Post with Acknowledgement Due.`,
    '',
    'The full text of the notice follows for your immediate reference.',
    '',
    '---',
    '',
    noticeToText(doc),
  ].join('\n')

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`

  return { to, subject, body, mailto }
}
