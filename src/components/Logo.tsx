const BLADE =
  'M0,0 C-7,-16 -18,-24 -26,-40 Q0,-20 26,-40 C18,-24 7,-16 0,0 Z'

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} fill="currentColor" aria-hidden="true">
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} transform={`rotate(${deg})`} d={BLADE} />
      ))}
    </svg>
  )
}
