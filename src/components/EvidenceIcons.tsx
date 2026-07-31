type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function DefectiveGoodsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 13h4l1.5-3 2 6 1.5-3h6" />
    </svg>
  )
}

export function OverchargingIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 17l5.5-5.5L13 15l6.5-8" />
      <path d="M14 7h5.5v5.5" />
    </svg>
  )
}

export function HazardousGoodsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3.5l8.5 15H3.5z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function MisleadingAdIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 5h16v10H9.5l-4 4V5Z" />
      <path d="M9.5 8.5l4 4M13.5 8.5l-4 4" />
    </svg>
  )
}

export function SpuriousProductsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 12.5 11 4.5h7a1 1 0 0 1 1 1v7l-8 8a1 1 0 0 1-1.4 0L3 13.9a1 1 0 0 1 0-1.4Z" />
      <circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <path d="M6 17.5a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0Z" />
      <path d="M6.6 16.1l3.2 2.8" />
    </svg>
  )
}

export function DeficientServiceIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8v5l3 2" />
      <path d="M9 3.5h6" />
    </svg>
  )
}

export function UnfairTradePracticeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3v16" />
      <path d="M6 21h12" />
      <path d="M12 6l-7 2.5M12 6l7 4" />
      <path d="M2.5 9.5a3 3 0 0 0 6 0" />
      <path d="M15 10.5a3 3 0 0 0 6 0" />
    </svg>
  )
}
