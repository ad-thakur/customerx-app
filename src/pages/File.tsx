import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepIndicator from '../components/StepIndicator'
import GroundStep from '../components/steps/GroundStep'
import AggregationPrompt from '../components/steps/AggregationPrompt'
import DetailsStep from '../components/steps/DetailsStep'
import EvidenceStep from '../components/steps/EvidenceStep'
import ReviewStep from '../components/steps/ReviewStep'
import { useIntake } from '../lib/IntakeContext'

type Phase = 'issue' | 'aggregation' | 'details' | 'evidence' | 'review'

// The aggregation prompt is an interstitial, not a numbered step — it maps to "Issue" (0).
const PHASE_INDEX: Record<Phase, number> = {
  issue: 0,
  aggregation: 0,
  details: 1,
  evidence: 2,
  review: 3,
}

export default function File() {
  const [phase, setPhase] = useState<Phase>('issue')
  const { update } = useIntake()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <StepIndicator current={PHASE_INDEX[phase]} />

      {phase === 'issue' && <GroundStep onNext={() => setPhase('aggregation')} />}

      {phase === 'aggregation' && (
        <AggregationPrompt
          onChoose={(joinGroup) => {
            update({ joinGroup })
            setPhase('details')
          }}
          onBack={() => setPhase('issue')}
        />
      )}

      {phase === 'details' && (
        <DetailsStep onNext={() => setPhase('evidence')} onBack={() => setPhase('aggregation')} />
      )}

      {phase === 'evidence' && (
        <EvidenceStep onNext={() => setPhase('review')} onBack={() => setPhase('details')} />
      )}

      {phase === 'review' && (
        <ReviewStep onBack={() => setPhase('evidence')} onSubmit={() => navigate('/result')} />
      )}
    </div>
  )
}
