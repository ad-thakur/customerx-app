import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepIndicator from '../components/StepIndicator'
import GroundStep from '../components/steps/GroundStep'
import DetailsStep from '../components/steps/DetailsStep'
import EvidenceStep from '../components/steps/EvidenceStep'
import ReviewStep from '../components/steps/ReviewStep'

export default function File() {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <StepIndicator current={step} />
      {step === 0 && <GroundStep onNext={() => setStep(1)} />}
      {step === 1 && <DetailsStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <EvidenceStep onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && (
        <ReviewStep onBack={() => setStep(2)} onSubmit={() => navigate('/result')} />
      )}
    </div>
  )
}
