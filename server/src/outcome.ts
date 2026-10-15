// ---------------------------------------------------------------------------
// Who won a consumer-commission case, read from the judgment itself.
//
// e-Jagriti's stage is "DISPOSED OFF" for almost every case, so the result has
// to come from the operative order at the end of the judgment. The rule, from
// the consumer's side:
//
//   - any direction against the business — pay, refund, replace, repair,
//     compensate, deliver — means the consumer prevailed (wholly or partly);
//   - the consumer's complaint dismissed or rejected means the business
//     prevailed;
//   - in an appeal or revision the disposition is read against who brought it:
//     a business's appeal dismissed (or the order "upheld", "no infirmity")
//     is a consumer win, and vice versa.
//
// Orders are in English, Hindi, Marathi or Kannada, so each signal has
// phrasings in all four. Text from legacy (non-Unicode) Kannada fonts is
// garbled on extraction and cannot be read — those stay 'unknown' and callers
// leave them out rather than showing an unclear outcome.
// ---------------------------------------------------------------------------

export type Outcome = 'consumer' | 'business' | 'settled' | 'withdrawn' | 'unknown'

/** Applications about an existing order (execution, miscellaneous, review…), not decisions on the merits. */
const NOT_A_DECISION = /\/(EA|MA|IA|RA|CA|EP|EXP|EXECUTION|MISC)\//i

/** True for case types that decide a complaint on its merits — the only ones worth citing. */
export function isMeritsCase(caseNumber: string): boolean {
  return !NOT_A_DECISION.test(caseNumber)
}

// Public bodies that are routinely the opposite party but rarely spelled out.
const PUBLIC_BODY =
  /\b(huda|dda|gda|lda|nda|yeida|jda|bda|cmda|cidco|mhada|haryana\s+(?:urban|shahari)|development\s+authority|municipal|nagar\s+(?:nigam|palika)|uhbvnl?|dhbvnl?|msedcl|mseb|bses|bescom|tneb|pspcl|electricity\s+board|bsnl|mtnl|railways?|post\s*master|postal|lic|sbi|gic|uiic|niacl|nicl|oicl|iffco|state\s+of)\b/i

// Who typically provides the goods or service in a consumer dispute. When both
// sides are firms, the side that looks like a provider is the opposite party.
const PROVIDER =
  /\b(bank|insurance|assurance|insurer|builders?|developers?|infra\w*|realty|estates?|housing|airways|airlines|telecom|hospital|motors|finance|financial|courier|logistics|travels|tours|university|institute|college|school)\b/i

const BUSINESS_NAME =
  /\b(ltd|limited|pvt|private|bank|insurance|assurance|corporation|corp|co\.|company|authority|motors|developers|builders|airways|airlines|hospital|telecom|infratech|industries|enterprises|services|board|india|finance|financial|nigam|vikas|udyog|bhandar|traders|agency|agencies|electronics|automobiles|realty|estates?|housing)\b/i

// The business told to do something for the consumer. "OP"/"opposite party"
// is the respondent in every consumer case; banks, insurers etc. are named.
const ACTOR =
  String.raw`(?:op|ops|o\.p\.?s?|op[- ]?\d+(?:\s*(?:&|and|to)\s*\d+)?|ops?\s*no\.?\s*\d+|opposite\s+part(?:y|ies)(?:\s*no\.?\s*\d+)?|respondents?(?:\s*no\.?\s*\d+)?|the\s+(?:company|bank|insurer|insurance\s+company|builder|developer|seller|manufacturer|dealer|authority|airline|hospital|appellant|petitioner)s?)`
const RELIEF = String.raw`(?:pay|refund|replace|repair|rectify|return|deliver|hand\s+over|compensate|reimburse|restore|install|issue|settle\s+the\s+claim|release)`
const DIRECTED = new RegExp(
  String.raw`\b${ACTOR}\b[^.;:]{0,90}?\b(?:is|are|shall|to|do|be|stands?)\b[^.;:]{0,40}?\b(?:hereby\s+)?(?:jointly\s+and\s+severally\s+)?(?:directed\s+to\s+|ordered\s+to\s+|liable\s+to\s+)?${RELIEF}\b`,
  'i',
)
const DIRECTED_PASSIVE =
  /\b(?:directed|ordered)\s+to\s+(?:pay|refund|replace|repair|return|deliver|compensate|reimburse)\b[^.]{0,120}\b(?:complainant|consumer)/i
const COMPLAINANT_ENTITLED =
  /\bcomplainants?\s+(?:is|are|shall\s+be)\s+(?:also\s+)?entitled\s+to\s+(?:get\s+)?(?:a\s+)?(?:refund|replacement|compensation|the\s+amount|rs\.?|₹)/i

const COMPLAINT_ALLOWED =
  /\b(?:complaints?|consumer\s+complaints?|cc)\s+(?:no\.?\s*[\w/.-]+\s+)?(?:is|are|stands?|be|is\s+hereby|are\s+hereby|deserves\s+to\s+be)\s+(?:partly\s+|partially\s+)?allowed|\ballowed\s+in\s+part\b|\bcomplaint\s+succeeds\b|\bwe\s+(?:partly\s+)?allow\s+the\s+complaint/i
const COMPLAINT_DISMISSED =
  /\b(?:complaints?|consumer\s+complaints?|cc)\s+(?:no\.?\s*[\w/.-]+\s+)?(?:is|are|stands?|be|is\s+hereby|are\s+hereby|deserves\s+to\s+be|is\s+accordingly|fails\s+and\s+is)\s+(?:dismissed|rejected)|\bcomplaint\s+(?:fails|is\s+devoid\s+of\s+merit)|\bno\s+merit\s+in\s+the\s+complaint|\bdismiss\s+the\s+complaint/i

const PROCEEDING_ALLOWED =
  /\b(?:appeals?|revisions?|revision\s+petitions?|petitions?|first\s+appeals?)\s+(?:no\.?\s*[\w/.-]+\s+)?(?:is|are|stands?|be|is\s+hereby|are\s+hereby|deserves\s+to\s+be)\s+(?:partly\s+|partially\s+)?allowed|\bimpugned\s+order\s+(?:is|stands|being)\s+(?:hereby\s+)?set\s+aside|\bset\s+aside\s+the\s+impugned\s+order/i
const PROCEEDING_DISMISSED =
  /\b(?:appeals?|revisions?|revision\s+petitions?|petitions?|first\s+appeals?)\b[^;:]{0,160}?\b(?:is|are|stands?|be|is\s+hereby|are\s+hereby|deserves\s+to\s+be|fails\s+and\s+is|is\s+accordingly)\s+(?:dismissed|rejected)|\bdismiss(?:ed)?\s+the\s+same\b|\b(?:do|does|did)\s+not\s+find\s+any\s+(?:merit|substance|force)\s+in\s+(?:this|the|these|present)\s+(?:appeal|revision|petition)|\b(?:no|any)\s+(?:ground|reason|infirmity|illegality|merit)\s+to\s+interfere|\bfind\s+no\s+(?:infirmity|illegality|merit|ground)|\bimpugned\s+order\s+(?:is|stands)\s+(?:upheld|affirmed|confirmed)|\b(?:upheld|affirmed|confirmed)\s+the\s+(?:impugned\s+)?order|\bappeal\s+fails\b|(?:^|\s)dismissed\.\s*(?:\S+\s+){0,30}?(?:\.{3,}|member|president)/i

const SETTLED =
  /\b(?:amicabl\w*\s+settled|settled\s+(?:between|amicably|out\s+of\s+court)|compromise\s+(?:deed|petition|memo|has\s+been)|lok\s+adalat|mediation\s+(?:was\s+)?successful|settlement\s+(?:arrived|reached))|तडजोड|समझौत|ರಾಜಿ/i
const WITHDRAWN =
  /\bdismissed\s+as\s+withdrawn|\bwithdrawn\s+with\s+liberty|\bpermitted\s+to\s+withdraw|\bcomplaint\s+is\s+withdrawn|dismiss\w*\s+(?:the\s+(?:complaint|appeal|petition|revision)\s+)?(?:in\s+default|for\s+(?:default|non[- ]?(?:prosecution|appearance)|want\s+of\s+prosecution))|मागे\s+घे|वापस\s+ले/i

// Hindi and Marathi share Devanagari; Kannada has its own script.
const IN_DIRECTED =
  /(?:अदा\s*कर(?:ावे|ावेत|ावी|े|ें|ेगा|ेंगे)|परत\s*कर(?:ावे|ावी|ावेत)|भुगतान\s*कर(?:े|ें|ेगा|ेंगे)|द्याव(?:े|ेत|ी)|देण्यात\s*यावी|वापस\s*कर(?:े|ें|ेगा)|बदलून\s*द्याव|ಪಾವತಿಸ(?:ಬೇಕು|ತಕ್ಕದ್ದು|ಲು\s*ಆದೇಶ)|ಹಿಂತಿರುಗಿಸ(?:ಬೇಕು|ತಕ್ಕದ್ದು)|ನೀಡ(?:ಬೇಕು|ತಕ್ಕದ್ದು))/
const IN_ALLOWED = /(?:(?:अंशतः\s*)?मंजूर\s*करण्यात\s*येत|परिवाद\s*(?:आंशिक\s*रूप\s*से\s*)?स्वीकार|ಪುರಸ್ಕರಿಸ(?:ಲಾಗಿದೆ|ಲಾಯಿತು)|ಭಾಗಶಃ\s*ಪುರಸ್ಕ)/
const IN_DISMISSED =
  /(?:तक्रार\s*(?:अर्ज\s*)?(?:फेटाळ|खारीज|अमान्य|नामंजूर\s*करण्यात\s*येत)|परिवाद\s*खारिज|शिकायत\s*खारिज|ದೂರನ್ನು\s*ವಜಾ|ವಜಾಗೊಳಿಸ)/

/** Share of characters that are readable Latin, Devanagari or Kannada letters. */
function readable(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '')
  if (letters.length < 40) return false
  const good = letters.match(/[A-Za-zऀ-ॿಀ-೿]/g)?.length ?? 0
  // Legacy Kannada fonts extract as accented Latin (¥Àæw, ªÀÄ…): mostly
  // Latin-1 supplement characters, which this rejects.
  const latin1 = letters.match(/[À-ÿ]/g)?.length ?? 0
  return good / letters.length > 0.7 && latin1 / letters.length < 0.08
}

/**
 * Who prevailed, from the consumer's side.
 *
 * @param stage       e-Jagriti's stage name (ALLOWED / DISMISSED / DISPOSED OFF …)
 * @param complainant who brought this proceeding — in an appeal or revision,
 *                    the appellant/petitioner, who may be the business
 * @param text        the end of the judgment, where the operative order sits
 *                    (a few thousand characters is plenty)
 */
export function classifyOutcome(
  caseNumber: string,
  stage: string | null,
  complainant: string | null,
  text: string | null,
  respondent: string | null = null,
): Outcome {
  const s = (stage ?? '').toUpperCase()
  const t = (text ?? '').replace(/&#\d+;|&nbsp;/g, ' ').replace(/\s+/g, ' ')

  if (/WITHDRAW|NON-PROSECUTION|NON PROSECUTION|IN DEFAULT/.test(s)) return 'withdrawn'
  if (/SETTLE|COMPROMISE|LOK ADALAT|MEDIAT/.test(s)) return 'settled'

  // The operative order is at the end; weigh the last ~2,500 characters most.
  const tail = t.slice(-2500)
  const original = /\/CC\//i.test(caseNumber) || !/\/(FA|RP|A|RA|R|RV|REV|CA)\//i.test(caseNumber)
  const appellant = complainant ?? ''
  const opponent = respondent ?? ''
  const looksBusiness = (n: string) => BUSINESS_NAME.test(n) || PUBLIC_BODY.test(n)
  // A firm can be the consumer (an insured trading company, say): if the other
  // side is the provider and the appellant is not, the appellant is the consumer.
  const appellantIsBusiness =
    !original &&
    looksBusiness(appellant) &&
    !(PROVIDER.test(opponent) && !PROVIDER.test(appellant) && !PUBLIC_BODY.test(appellant))

  if (WITHDRAWN.test(tail)) return 'withdrawn'
  if (SETTLED.test(tail) && !DIRECTED.test(tail)) return 'settled'

  // Stage names, when e-Jagriti records them, are authoritative for the proceeding.
  let disposition: 'allowed' | 'dismissed' | null = /ALLOW/.test(s) ? 'allowed' : /DISMISS|REJECT/.test(s) ? 'dismissed' : null

  if (!disposition && t) {
    if (!readable(tail)) return 'unknown'
    const directed = DIRECTED.test(tail) || DIRECTED_PASSIVE.test(tail) || COMPLAINANT_ENTITLED.test(tail) || IN_DIRECTED.test(tail)
    if (original) {
      // Any relief ordered against the business is a consumer win, even if
      // other prayers were rejected ("other claims are dismissed").
      if (directed || COMPLAINT_ALLOWED.test(tail) || IN_ALLOWED.test(tail)) return 'consumer'
      if (COMPLAINT_DISMISSED.test(tail) || IN_DISMISSED.test(tail)) return 'business'
      return 'unknown'
    }
    // Appeals and revisions: the last explicit disposition wins.
    const allowedAt = lastIndex(tail, PROCEEDING_ALLOWED)
    const dismissedAt = lastIndex(tail, PROCEEDING_DISMISSED)
    if (allowedAt >= 0 || dismissedAt >= 0) disposition = allowedAt > dismissedAt ? 'allowed' : 'dismissed'
    else if (COMPLAINT_DISMISSED.test(tail) || IN_DISMISSED.test(tail)) return 'business'
    else if (directed) return 'consumer'
    else return 'unknown'
  }
  if (!disposition) return 'unknown'

  const consumerBrought = original || !appellantIsBusiness
  const consumerWon = (disposition === 'allowed') === consumerBrought
  if (consumerWon) return 'consumer'
  // A consumer who appealed for more and lost still keeps what the fora below
  // awarded: if the order records relief granted to them, the consumer prevailed.
  if (!original && consumerBrought && RELIEF_BELOW.test(tail)) return 'consumer'
  return 'business'
}

const RELIEF_BELOW =
  /\b(?:directed|ordered|awarded|granted)\b[^.]{0,120}\b(?:refund|replace|compensation|rs\.?\s*[\d,]+|₹\s*[\d,]+)|\b(?:refund|replace)\s+(?:the\s+)?[^.]{0,60}\b(?:along\s+with|with)\s+(?:interest|compensation)|\bdecree\s+stood\s+satisfied/i

function lastIndex(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let at = -1
  for (const m of text.matchAll(g)) at = m.index ?? at
  return at
}
