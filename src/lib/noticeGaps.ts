// ---------------------------------------------------------------------------
// Gap-fill questions shown between "Generate notice" and the draft.
//
// The main intake form stays short. Anything the notice needs but the form did
// not capture is asked for here, after the user has committed, and only where
// the question actually sharpens a word of the document. A deficiency-in-service
// case is never asked to describe goods.
//
// The draft is always dispatchable without these — buildNotice renders every
// field gracefully when it is blank, so nothing ever reaches the page as a
// [PLACEHOLDER]. These questions exist to make the notice specific, which is
// what makes it hard to ignore. Fields marked `optional` never block.
// ---------------------------------------------------------------------------

import type { IntakeData } from './types'
import { readGrounds } from './grounds'

export type GapKind = 'text' | 'textarea' | 'select'

export interface GapQuestion {
  /** Key on IntakeData that this question fills. */
  field: keyof IntakeData
  kind: GapKind
  label: string
  /** Shown under the input. Explains why the notice needs it. */
  help?: string
  placeholder?: string
  options?: string[]
  /** When true, a blank answer does not hold up generation. */
  optional?: boolean
  /** Only ask when this returns true. */
  when?: (intake: IntakeData) => boolean
}

const isGoodsCase = (intake: IntakeData): boolean =>
  readGrounds(intake).some((g) =>
    ['defective_goods', 'spurious_goods', 'hazardous_goods', 'overcharging'].includes(g),
  )

export const GAP_QUESTIONS: GapQuestion[] = [
  {
    field: 'itemDescription',
    kind: 'text',
    label: 'What exactly did you buy?',
    help: 'Named precisely, this appears in the subject line and in the statement of facts.',
    placeholder: 'one automatic washing machine, Model WX-500, Serial No. 8891',
    when: isGoodsCase,
  },
  {
    field: 'itemDescription',
    kind: 'text',
    label: 'What service did you pay for?',
    help: 'Named precisely, this appears in the subject line and in the statement of facts.',
    placeholder: 'a two-night stay at Hotel X, Booking No. 44120',
    when: (intake) => !isGoodsCase(intake),
  },
  {
    field: 'invoiceNo',
    kind: 'text',
    label: 'Invoice, order or booking number',
    help: 'The reference the company will use to locate your transaction. Leave blank if there was none.',
    placeholder: 'Invoice No. INV-2024-11872',
    optional: true,
  },
  {
    field: 'paymentMode',
    kind: 'select',
    label: 'How did you pay?',
    options: [
      'UPI',
      'credit card',
      'debit card',
      'net banking',
      'cash',
      'cheque',
      'a no-cost EMI facility',
      'a wallet',
      'cash on delivery',
    ],
  },
  {
    field: 'representations',
    kind: 'textarea',
    label: 'What did they promise you about it?',
    help: 'Quote the advertisement, the warranty card or what the salesperson told you. This is what turns a complaint into a breach, so be specific.',
    placeholder:
      'the machine carried a two-year comprehensive warranty covering the motor and drum, and that any fault would be attended to within 48 hours',
  },
  {
    field: 'grievanceMode',
    kind: 'select',
    label: 'How did you first complain to them?',
    help: 'The notice has to record that you gave them a chance to put it right.',
    options: [
      'wrote to you by email',
      'wrote to you by letter',
      'lodged a complaint on your website',
      'lodged a complaint through your mobile application',
      'called your customer care helpline',
      'raised the matter in person at your outlet',
    ],
  },
  {
    field: 'grievanceRef',
    kind: 'text',
    label: 'Complaint or ticket number, if they gave you one',
    help: 'Leave blank if none was issued. Where there is one, quoting it makes the complaint harder to deny.',
    placeholder: 'Ticket No. CC-99215',
    optional: true,
  },
  {
    field: 'companyAddress',
    kind: 'text',
    label: "The company's postal address",
    help: 'A notice has to name where the opposite party can be reached. Its registered or branch office.',
    placeholder: 'Regd. Office: 21 Industrial Estate, Andheri East, Mumbai',
  },
  {
    field: 'addressLine',
    kind: 'text',
    label: 'Your street address',
    help: 'A notice has to carry the full postal address of the sender.',
    placeholder: 'Flat 402, Sunrise Apartments, Linking Road',
  },
  {
    field: 'pincode',
    kind: 'text',
    label: 'Your PIN code',
    placeholder: '400050',
  },
]

/**
 * Questions still worth asking for this case: the `when` matches, and the field
 * is empty on the intake. Optional questions are included (so the pop-up offers
 * them) but a caller can tell them apart via `q.optional`.
 */
export function pendingGaps(intake: IntakeData): GapQuestion[] {
  return GAP_QUESTIONS.filter((q) => {
    if (q.when && !q.when(intake)) return false
    const value = intake[q.field]
    return typeof value !== 'string' || value.trim() === ''
  })
}

/** True when a required (non-optional) gap is still unfilled for this case. */
export function hasRequiredGaps(intake: IntakeData): boolean {
  return pendingGaps(intake).some((q) => !q.optional)
}
