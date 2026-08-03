import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepIndicator from '../components/StepIndicator'
import GroundStep from '../components/steps/GroundStep'
import DetailsStep from '../components/steps/DetailsStep'
import AggregationPrompt from '../components/steps/AggregationPrompt'
import EvidenceStep from '../components/steps/EvidenceStep'
import ReviewStep from '../components/steps/ReviewStep'
import { useIntake } from '../lib/IntakeContext'

// The aggregation prompt is an interstitial after Details (once the company is
// known) — not a numbered step, so it maps to the Details index in the indicator.
type Phase = 'ground' | 'details' | 'aggregation' | 'evidence' | 'review'
const PHASE_INDEX: Record<Phase, number> = {
  ground: 0,
  details: 1,
  aggregation: 1,
  evidence: 2,
  review: 3,
}

export default function File() {
  const [phase, setPhase] = useState<Phase>('ground')
  const { update } = useIntake()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <StepIndicator current={PHASE_INDEX[phase]} />

      {phase === 'ground' && <GroundStep onNext={() => setPhase('details')} />}

      {phase === 'details' && (
        <DetailsStep onNext={() => setPhase('aggregation')} onBack={() => setPhase('ground')} />
      )}

      {phase === 'aggregation' && (
        <AggregationPrompt
          onChoose={(joinGroup) => {
            update({ joinGroup })
            setPhase('evidence')
          }}
          onBack={() => setPhase('details')}
        />
      )}

      {phase === 'evidence' && (
        <EvidenceStep onNext={() => setPhase('review')} onBack={() => setPhase('aggregation')} />
      )}

      {phase === 'review' && (
        <ReviewStep onBack={() => setPhase('evidence')} onSubmit={() => navigate('/result')} />
      )}
    </div>
  )
}
