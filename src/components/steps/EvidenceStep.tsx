import { useRef } from 'react'
import { useIntake } from '../../lib/IntakeContext'
import type { EvidenceFile } from '../../lib/types'

const CATEGORY_LABELS: Record<EvidenceFile['category'], string> = {
  invoice: 'Invoice / payment proof',
  photo: 'Photo / screenshot',
  correspondence: 'Correspondence',
  warranty: 'Warranty / agreement',
  other: 'Other',
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export default function EvidenceStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data, update } = useIntake()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    const newFiles: EvidenceFile[] = []
    for (const file of Array.from(fileList)) {
      if (file.size > 8 * 1024 * 1024) continue // skip files over 8MB for this prototype
      const dataUrl = await readAsDataUrl(file)
      newFiles.push({
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        type: file.type,
        sizeKb: Math.round(file.size / 1024),
        dataUrl,
        category: 'other',
      })
    }
    update({ evidence: [...data.evidence, ...newFiles] })
  }

  function setCategory(id: string, category: EvidenceFile['category']) {
    update({ evidence: data.evidence.map((e) => (e.id === id ? { ...e, category } : e)) })
  }

  function removeFile(id: string) {
    update({ evidence: data.evidence.filter((e) => e.id !== id) })
  }

  const canContinue = data.narrative.trim().length > 20

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">Describe what happened</h2>
      <p className="text-ink-soft mb-8">
        Write it in your own words, then attach whatever supports it. More evidence means a stronger
        assessment.
      </p>

      <label className="block text-sm font-medium text-ink mb-1.5">Your account of events</label>
      <textarea
        className="w-full border border-line rounded-md px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink min-h-[140px]"
        value={data.narrative}
        onChange={(e) => update({ narrative: e.target.value })}
        placeholder="What did you buy or sign up for, what went wrong, and what have you asked the company to do about it?"
      />

      <div className="mt-8">
        <label className="block text-sm font-medium text-ink mb-1.5">Evidence</label>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleFiles(e.dataTransfer.files)
          }}
          className="border-2 border-dashed border-line rounded-lg p-8 text-center cursor-pointer hover:border-ink-soft hover:bg-white/60 transition"
        >
          <p className="text-ink font-medium">Drop files here, or click to upload</p>
          <p className="text-sm text-ink-soft mt-1">Invoices, photos, screenshots, warranty cards — up to 8MB each</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {data.evidence.length > 0 && (
          <ul className="mt-5 space-y-3">
            {data.evidence.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-3 border border-line rounded-md px-4 py-3 bg-white/60"
              >
                {f.type.startsWith('image/') ? (
                  <img src={f.dataUrl} alt={f.name} className="w-10 h-10 object-cover rounded" />
                ) : (
                  <span className="w-10 h-10 flex items-center justify-center bg-paper-dim rounded text-xs case-number">
                    FILE
                  </span>
                )}
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm text-ink truncate max-w-[220px]">{f.name}</p>
                  <p className="text-xs text-ink-soft">{f.sizeKb} KB</p>
                </div>
                <select
                  value={f.category}
                  onChange={(e) => setCategory(f.id, e.target.value as EvidenceFile['category'])}
                  className="text-sm border border-line rounded-md px-2 py-1.5 bg-white"
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="text-seal text-sm font-medium hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 flex justify-between">
        <button type="button" onClick={onBack} className="text-ink-soft font-medium hover:text-ink transition-colors">
          ← Back
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onNext}
          className="bg-ink text-paper px-7 py-3 rounded-full font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-seal transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
