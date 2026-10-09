import { Link } from 'react-router-dom'
import Logo from './Logo'
import { BRAND_NAME, GRIEVANCE_EMAIL } from '../lib/brand'

export default function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-6 py-12 grid gap-8 md:grid-cols-3 text-sm text-ink-soft">
        <div>
          <p className="flex items-center gap-2 font-display text-xl text-ink mb-2">
            <Logo className="w-6 h-6 text-ink" />
            {BRAND_NAME}
          </p>
          <p className="max-w-xs">
            Document assembly and case-tracking support for consumers pursuing complaints under the
            Consumer Protection Act, 2019. {BRAND_NAME} is not a law firm; filings are reviewed and
            submitted with the involvement of empanelled advocates where engaged.
          </p>
        </div>
        <div>
          <p className="text-ink font-medium mb-2">Know your rights</p>
          <p>
            You are never required to hire an advocate to file or appear before a District, State, or
            National Consumer Commission. Self-representation is a right under the Act.
          </p>
        </div>
        <div>
          <p className="text-ink font-medium mb-2">Grievance Officer</p>
          <p>{GRIEVANCE_EMAIL} · Data handled per the DPDP Act, 2023</p>
          <p className="mt-4">
            Run a consumer brand?{' '}
            <Link to="/brand" className="text-ink underline hover:text-seal">
              {BRAND_NAME} for brands
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
