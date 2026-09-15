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
//  - The draft carries no [BRACKETED] placeholders. The notice-specifics the
//    intake form does not ask for (the exact goods, invoice number, mode of
//    payment, the representations relied upon) are gathered in a short pop-up
//    before the draft is shown (see lib/noticeGaps.ts). Anything still not
//    supplied is rendered gracefully — a clause simply drops out — rather than
//    surfaced as a blank to fill. A notice never shows the user its own scaffolding.
//  - The output is sanitised so a dispatched notice never carries em/en dashes,
//    curly quotes or ellipses: they read as machine-set and out of place next to
//    Times New Roman. This holds for our generated text and for anything the
//    user pastes in while editing.
// ---------------------------------------------------------------------------

import type { CaseView, DispatchMethod } from './caseStore'
import { characterisations, groundListLabel, readGrounds } from './grounds'
import { fmtDate, inr, noticeRef } from './caseStore'
import type { CommissionLevel, EvidenceFile } from './types'

export const COMPLIANCE_DAYS = 30

/** Interest claimed on the refund, per annum, from the transaction date. */
export const INTEREST_RATE = 18

/** Ceiling on the harassment component, by the forum the claim routes to. */
const HARASSMENT_CAP: Record<CommissionLevel, number> = {
  district: 80_000,
  state: 125_000,
  national: 175_000,
}

/**
 * Non-pecuniary component of the compensation demand: 20% of the consideration
 * paid, floored at Rs 20,000 and capped by forum. Consequential loss is claimed
 * separately and is not part of this figure.
 */
export function harassmentAmount(claim: number, level: CommissionLevel): number {
  return Math.min(Math.max(Math.round(claim * 0.2), 20_000), HARASSMENT_CAP[level])
}

/** Name in which the notice is transmitted on the complainant's behalf. */
export const PLATFORM_NAME = 'ConsumerX'

/**
 * Strips characters that mark text as machine-written from a dispatched Indian
 * legal notice: em/en dashes, curly quotes and the ellipsis glyph. Applied to
 * every block, so neither our own drafting nor a passage the user pastes from a
 * word processor can carry one into the .docx, the email or the clipboard copy.
 */
export function sanitizeNoticeText(s: string): string {
  return s
    .replace(/…/g, '...')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s*—\s*/g, ', ') // em dash reads as a comma
    .replace(/\s*–\s*/g, '-') // en dash reads as a hyphen
    .replace(/ /g, ' ') // non-breaking space
    .replace(/ +,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
}

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
  | 'dispatch' // transmitted-by footer

export interface NoticeBlock {
  id: string
  kind: BlockKind
  /** Rendered before the text: "1.", "(a)", "(iii)". Recomputed after any deletions. */
  label?: string
  text: string
  /** Shown to the user in the editor when the block needs their attention. */
  hint?: string
  /** True when the text still contains an unfilled [PLACEHOLDER]. */
  needsInput?: boolean
  /** For sub-paragraphs: how the auto-number is rendered when renumbering. */
  numStyle?: 'letter' | 'roman'
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

/**
 * Matches anything still in square brackets: SHOUTING placeholders like
 * [MODE OF PAYMENT], the blank-line form [__], and lowercase drafting choices
 * like [wrote to you / lodged complaint No. ___ / called your customer care].
 * All three need the user's attention before dispatch, so all three count.
 */
const PLACEHOLDER = /\[[^\]\n]{2,}\]/

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

function subLabel(n: number, style: NoticeBlock['numStyle']): string {
  if (style === 'roman') return `(${ROMAN[n - 1] ?? n})`
  return `(${LETTERS[n - 1] ?? n})`
}

/**
 * Renumbers paragraphs, sub-paragraphs and annexures after any user deletions,
 * so the notice never shows a gap like "3." then "5.". Sub-paragraph counters
 * reset at each new numbered paragraph.
 */
function renumber(blocks: NoticeBlock[]): void {
  let para = 0
  let sub = 0
  let ann = 0
  for (const b of blocks) {
    if (b.kind === 'para') {
      para += 1
      sub = 0
      b.label = `${para}.`
    } else if (b.kind === 'sub') {
      sub += 1
      b.label = subLabel(sub, b.numStyle)
    } else if (b.kind === 'annexure') {
      ann += 1
      b.label = `Annexure ${ann}:`
    }
  }
}

/** Full postal address of the complainant, as it appears in the notice. */
function complainantAddress(c: CaseView): string {
  return [c.intake.addressLine, c.intake.city, c.intake.state, c.intake.pincode]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

function commissionName(c: CaseView): string {
  switch (c.routing.commission) {
    case 'district':
      return `District Consumer Disputes Redressal Commission${c.intake.city ? `, ${c.intake.city}` : ''}`
    case 'state':
      return c.intake.state
        ? `State Consumer Disputes Redressal Commission, ${c.intake.state}`
        : 'the State Consumer Disputes Redressal Commission having jurisdiction'
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
  const company = c.intake.companyName
  const noticeDate = c.notice?.sentAt ?? new Date().toISOString()
  const isGoods = grounds.some((g) =>
    ['defective_goods', 'spurious_goods', 'hazardous_goods', 'overcharging'].includes(g),
  )

  // Notice-specifics gathered after intake (lib/noticeGaps.ts). Each is rendered
  // gracefully when blank: a clause drops out rather than showing a placeholder.
  const item = (c.intake.itemDescription ?? '').trim()
  const itemLabel = item || (isGoods ? 'the goods supplied to me' : 'the service rendered to me')
  const itemInFacts = item || (isGoods ? 'the goods in question' : 'the service in question')
  const invoiceNo = (c.intake.invoiceNo ?? '').trim()
  const paymentMode = (c.intake.paymentMode ?? '').trim()
  const representations = (c.intake.representations ?? '').replace(/[\s.]+$/, '').trim()
  const grievanceMode = (c.intake.grievanceMode ?? '').trim()
  const grievanceRef = (c.intake.grievanceRef ?? '').trim()

  const blocks: NoticeBlock[] = []
  const push = (b: Omit<NoticeBlock, 'needsInput'>) => {
    const edited = edits[b.id]
    // An edit cleared to empty means the user deleted this block — omit it
    // entirely, so it also drops out of the text, email and .docx outputs.
    if (edited !== undefined && edited.trim() === '') return
    const text = sanitizeNoticeText(edited ?? b.text)
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
    text: c.intake.companyEmail
      ? 'BY REGISTERED POST WITH ACKNOWLEDGEMENT DUE AND BY EMAIL'
      : 'BY REGISTERED POST WITH ACKNOWLEDGEMENT DUE',
  })

  push({
    id: 'to',
    kind: 'address',
    text: [
      'To,',
      'The Managing Director / The Authorised Signatory,',
      company,
      c.intake.companyAddress,
      c.intake.companyEmail,
    ]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
      .join('\n'),
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
  } on account of ${groundListLabel(grounds)} in respect of ${itemLabel}, failing which appropriate legal proceedings shall be initiated against you, entirely at your risk as to costs and consequences.`
  push({
    id: 'subject',
    kind: 'subject',
    text: subject,
    hint: 'Name the goods or service in a few words, for example "one automatic washing machine, Model XYZ".',
  })

  push({ id: 'salutation', kind: 'salutation', text: 'Sir/Madam,' })

  /* --- 1. Capacity ------------------------------------------------------- */

  push({
    id: 'p1',
    kind: 'para',
    label: '1.',
    text: `I, ${c.intake.fullName}${
      complainantAddress(c) ? `, resident of ${complainantAddress(c)}` : ''
    }, the complainant herein, do hereby serve upon you this legal notice as follows:`,
    hint: 'The Act permits self-representation. This notice is issued by you in your own name.',
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
    `That on ${fmtDate(c.intake.transactionDate)}, I ${
      isGoods ? 'purchased' : 'availed of'
    } ${itemInFacts} from you${
      invoiceNo ? ` vide ${invoiceNo}` : ''
    } for a total consideration of ${inr(claim)}${
      paymentMode ? `, paid through ${paymentMode}` : ''
    }.`,
  )
  // Representations are a limb of the claim, so this sentence always appears:
  // the complainant's own words where given, otherwise a generic assurance that
  // keeps the later "representations aforesaid" reference sound.
  const repText =
    representations ||
    (isGoods
      ? 'the goods supplied would be of the standard, quality and description agreed and would be fit for the purpose for which they were purchased'
      : 'the service would be rendered with due care and skill and would conform to the standard and quality agreed')
  facts.push(
    `That at the time of the said transaction, you represented and assured me that ${repText}.`,
  )

  const narrativeFacts = splitNarrative(c.intake.narrative ?? '', 5)
  if (narrativeFacts.length > 0) {
    facts.push(...narrativeFacts)
  } else {
    facts.push(
      `That the ${
        isGoods
          ? 'goods so supplied were found to be defective'
          : 'service so rendered was found to be deficient'
      } and did not conform to the representations and standards aforesaid.`,
    )
  }

  facts.forEach((text, i) => {
    push({
      id: `p3-${i}`,
      kind: 'sub',
      numStyle: 'letter',
      label: `(${LETTERS[i] ?? i + 1})`,
      text,
      hint:
        i >= 2
          ? 'Taken from your own account. Keep it factual and dated. Specificity is what makes a notice strong; overstatement weakens it.'
          : undefined,
    })
  })

  /* --- 4. Prior grievance ------------------------------------------------ */

  const hasCorrespondence = (c.intake.evidence ?? []).some((e) => e.category === 'correspondence')
  push({
    id: 'p4',
    kind: 'para',
    label: '4.',
    text: `That on becoming aware of the aforesaid, I promptly took up the matter with you. On ${fmtDate(
      c.intake.incidentDate,
    )}, I ${grievanceMode || 'took up the matter with you'}${
      grievanceRef ? `, bearing reference ${grievanceRef},` : ''
    } seeking redressal.${
      hasCorrespondence ? ' The said communication is annexed hereto.' : ''
    } Despite the said communication, you have failed and neglected to redress the grievance, and the resolution promised was never provided, thereby compelling me to issue the present notice.`,
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
      numStyle: 'roman',
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

  const harassment = harassmentAmount(claim, c.routing.commission)
  const compensation = cons + harassment

  const demands: string[] = [
    `Refund the sum of ${inr(claim)} together with interest thereon at ${INTEREST_RATE}% per annum from ${fmtDate(
      c.intake.transactionDate,
    )} till the date of realisation; and/or`,
    isGoods
      ? 'Replace the defective goods with goods conforming to the standard represented and warranted; and'
      : 'Rectify and make good the deficiency in service, and render the service as originally promised; and',
    `Pay a sum of ${inr(compensation)} towards compensation${
      cons > 0
        ? `, being ${inr(cons)} towards consequential loss and ${inr(
            harassment,
          )} towards the harassment, inconvenience and mental agony suffered by me`
        : ' for the harassment, inconvenience and mental agony suffered by me'
    }; and`,
    'Pay the costs of and incidental to this notice, as may be assessed by the Commission.',
  ]

  demands.forEach((text, i) => {
    push({ id: `p7-${i}`, kind: 'sub', numStyle: 'letter', label: `(${LETTERS[i]})`, text })
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

  const signatureLines = [
    c.intake.fullName,
    'Complainant',
    complainantAddress(c),
    c.intake.phone,
    c.intake.email,
  ]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
  push({
    id: 'signature',
    kind: 'signature',
    text: ['Yours faithfully,', '', '', ...signatureLines].join('\n'),
    hint: 'Sign above your name before dispatch. This notice is issued by you in person and in your own name.',
  })

  push({
    id: 'dispatch',
    kind: 'dispatch',
    text: `Transmitted by ${PLATFORM_NAME} on behalf of and under the instructions of the complainant named above. ${PLATFORM_NAME} is an online consumer grievance platform and does not act as an advocate or pleader. The contents of this notice are those of the complainant, and the notice is issued and signed by the complainant in person under the Consumer Protection Act, 2019.`,
    hint: 'This line records that Consumer X transmitted the notice on your behalf. It does not change the fact that the notice is issued and signed by you.',
  })

  /* --- Annexures --------------------------------------------------------- */

  const annexures = annexureList(c.intake.evidence ?? [])
  if (annexures.length > 0) {
    push({
      id: 'ann-title',
      kind: 'annexure-title',
      text: 'SCHEDULE OF ANNEXURES (annexed hereto and relied upon)',
    })
    annexures.forEach((a, i) => {
      push({ id: `ann-${i}`, kind: 'annexure', label: `Annexure ${i + 1}:`, text: a })
    })
  }

  renumber(blocks)

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
      case 'dispatch':
        out.push('', '---', b.text)
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

export function buildEmailDraft(
  c: CaseView,
  doc: NoticeDoc,
  methods: DispatchMethod[] = [],
): EmailDraft {
  const to = doc.recipientEmail ?? ''
  const subject = sanitizeNoticeText(
    `Legal Notice under the Consumer Protection Act, 2019, Ref. ${doc.ref}, ${
      c.intake.fullName || 'Complainant'
    } v. ${c.intake.companyName || 'Opposite Party'}`,
  )

  // Only state a physical-dispatch mode that is actually being used — asserting
  // Registered Post when the complainant sent email only would be a false
  // statement of fact inside a legal notice.
  const physicalDispatch = methods.includes('registered_post')
    ? 'A copy of this notice is also being dispatched to you by Registered Post with Acknowledgement Due.'
    : methods.includes('courier')
      ? 'A copy of this notice is also being dispatched to you by courier.'
      : null

  const body = [
    'Dear Sir/Madam,',
    '',
    `I am enclosing herewith a legal notice under the Consumer Protection Act, 2019, bearing reference ${doc.ref}, in respect of the matter set out therein.`,
    '',
    `You are called upon to comply with the demands set out in the notice within ${COMPLIANCE_DAYS} days of receipt.`,
    ...(physicalDispatch ? ['', physicalDispatch] : []),
    '',
    'The full text of the notice follows for your immediate reference. Kindly acknowledge receipt of this notice by return email.',
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
