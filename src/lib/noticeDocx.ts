// ---------------------------------------------------------------------------
// Renders a NoticeDoc as a Word (.docx) file.
//
// Built directly as OOXML over the store-only ZIP writer in ./zip — no runtime
// dependency. The output is a plain, fully editable Word document: the user is
// expected to open it, adjust anything they want, attach their annexures and
// send it themselves. Nothing here dispatches anything.
// ---------------------------------------------------------------------------

import { makeZip, type ZipEntry } from './zip'
import type { NoticeBlock, NoticeDoc } from './noticeDraft'

const enc = new TextEncoder()
const file = (name: string, xml: string): ZipEntry => ({ name, data: enc.encode(xml) })

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface RunOpts {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  caps?: boolean
  size?: number // half-points; 22 = 11pt
}

interface ParaOpts extends RunOpts {
  align?: 'left' | 'center' | 'right' | 'both'
  /** Twentieths of a point. */
  spaceBefore?: number
  spaceAfter?: number
  indentLeft?: number
  /** Negative hanging indent, used for numbered paragraphs. */
  hanging?: number
}

/** One <w:p>, splitting on newlines into <w:br/> so multi-line blocks survive. */
function para(text: string, opts: ParaOpts = {}): string {
  const rPr = [
    opts.bold ? '<w:b/>' : '',
    opts.italic ? '<w:i/>' : '',
    opts.underline ? '<w:u w:val="single"/>' : '',
    opts.caps ? '<w:caps/>' : '',
    `<w:sz w:val="${opts.size ?? 22}"/>`,
    `<w:szCs w:val="${opts.size ?? 22}"/>`,
  ].join('')

  const runs = text
    .split('\n')
    .map((line, i) => {
      const br = i > 0 ? '<w:br/>' : ''
      return `<w:r><w:rPr>${rPr}</w:rPr>${br}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`
    })
    .join('')

  const ind =
    opts.indentLeft || opts.hanging
      ? `<w:ind w:left="${opts.indentLeft ?? 0}"${opts.hanging ? ` w:hanging="${opts.hanging}"` : ''}/>`
      : ''

  const pPr =
    `<w:pPr>` +
    (opts.align ? `<w:jc w:val="${opts.align}"/>` : '') +
    `<w:spacing w:before="${opts.spaceBefore ?? 0}" w:after="${opts.spaceAfter ?? 120}" w:line="276" w:lineRule="auto"/>` +
    ind +
    `<w:rPr>${rPr}</w:rPr>` +
    `</w:pPr>`

  return `<w:p>${pPr}${runs}</w:p>`
}

function blockToXml(b: NoticeBlock): string {
  const body = b.label ? `${b.label}\t${b.text}` : b.text

  switch (b.kind) {
    case 'ref':
      return para(b.text, { spaceAfter: 240 })
    case 'mode':
      return para(b.text, { bold: true, spaceAfter: 240 })
    case 'address':
      return para(b.text, { spaceAfter: 240 })
    case 'marking':
      return para(b.text, { bold: true, align: 'center', spaceBefore: 120, spaceAfter: 120 })
    case 'title':
      return para(b.text, {
        bold: true,
        underline: true,
        align: 'center',
        spaceBefore: 120,
        spaceAfter: 240,
      })
    case 'subject':
      return para(`Sub: ${b.text}`, { align: 'both', spaceAfter: 240 })
    case 'salutation':
      return para(b.text, { spaceAfter: 200 })
    case 'para':
      return para(body, { align: 'both', spaceAfter: 160, indentLeft: 425, hanging: 425 })
    case 'sub':
      return para(body, { align: 'both', spaceAfter: 140, indentLeft: 1135, hanging: 425 })
    case 'signature':
      return para(b.text, { spaceBefore: 360, spaceAfter: 120 })
    case 'annexure-title':
      return para(b.text, { bold: true, spaceBefore: 360, spaceAfter: 160 })
    case 'annexure':
      return para(body, { spaceAfter: 100, indentLeft: 425, hanging: 425 })
    default:
      return para(b.text)
  }
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

// Serif body face — a legal notice should not arrive in Calibri.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
<w:sz w:val="22"/><w:szCs w:val="22"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
<w:name w:val="Normal"/><w:qFormat/>
</w:style>
</w:styles>`

/** Builds the .docx bytes for a notice. */
export function noticeToDocx(doc: NoticeDoc): Uint8Array {
  const bodyXml = doc.blocks.map(blockToXml).join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${bodyXml}<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr></w:body>
</w:document>`

  return makeZip([
    file('[Content_Types].xml', CONTENT_TYPES),
    file('_rels/.rels', ROOT_RELS),
    file('word/_rels/document.xml.rels', DOC_RELS),
    file('word/document.xml', documentXml),
    file('word/styles.xml', STYLES),
  ])
}

/** Suggested filename, e.g. "Legal-Notice-REF-CX-2026-00417.docx". */
export function noticeFilename(doc: NoticeDoc): string {
  return `Legal-Notice-${doc.ref.replace(/\//g, '-')}.docx`
}

/** Triggers a browser download of the notice as .docx. */
export function downloadNoticeDocx(doc: NoticeDoc) {
  const bytes = noticeToDocx(doc)
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = noticeFilename(doc)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick so the click has definitely been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
