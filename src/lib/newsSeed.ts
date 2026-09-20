// Seed data for the Consumer Watch news index.
//
// This is the *first pass* produced by the news agent: real third-party
// articles, each stored as a link + a neutral, attributed summary + extracted
// company/sector tags. We never reproduce the full article — the page points to
// the publisher's own site. Once the recurring agent (server-side) is live, the
// page will read these rows from Postgres instead of this file.
//
// category:  'law'    — consumer-protection laws, rules and regulator guidance
//            'breach' — findings / penalties against a company
//            'action' — a consumer (or class) acting against a company under the CPA

export type NewsCategory = 'law' | 'breach' | 'action'

export interface NewsArticle {
  id: string
  title: string
  source: string
  url: string
  /** ISO date the piece was published (best-effort from the source). */
  publishedAt: string
  summary: string
  companies: string[]
  sectors: string[]
  category: NewsCategory
}

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  law: 'Laws & rules',
  breach: 'Company breaches',
  action: 'Consumer actions',
}

export const NEWS_SEED: NewsArticle[] = [
  {
    id: 'ccpa-100-percent-2026',
    title: "CCPA cracks down on '100%' label claims, penalises Storia Foods and English Oven",
    source: 'Chambers & Partners',
    url: 'https://chambers.com/articles/ccpa-penalises-100-claims-what-india-s-latest-misleading-advertising-ruling-means-for-fmcg-and-c',
    publishedAt: '2026-06-18',
    summary:
      "The Central Consumer Protection Authority fined Storia Foods & Beverages and Mrs. Bector's Food Specialities (English Oven) ₹1 lakh each and ordered them to drop '100%' composition claims from packaging, websites and marketplace listings — ruling that such claims must be literally and verifiably true.",
    companies: ['Storia Foods & Beverages', "Mrs. Bector's Food Specialities", 'English Oven'],
    sectors: ['Food & beverages', 'Misleading ads'],
    category: 'law',
  },
  {
    id: 'ecommerce-amendment-rules-2026',
    title: 'Consumer Protection (E-Commerce) Amendment Rules, 2026 notified',
    source: 'Govt. notification (Simpliance)',
    url: 'https://www.simpliance.in/India/EHS/govt_notification/Central/notification-of-the-consumer-protection-e-commerce-amendment-rules-2026-10234',
    publishedAt: '2026-07-15',
    summary:
      'The Department of Consumer Affairs notified amendments to the Consumer Protection (E-Commerce) Rules, tightening obligations on online marketplaces around seller disclosures, refunds and grievance-redressal timelines.',
    companies: [],
    sectors: ['E-commerce', 'Regulation'],
    category: 'law',
  },
  {
    id: 'ccpa-misleading-ads-2026',
    title: 'CCPA steps up enforcement against misleading advertisements',
    source: 'InsightsOnIndia',
    url: 'https://www.insightsonindia.com/2026/09/07/the-central-consumer-protection-authority-ccpa/',
    publishedAt: '2026-09-07',
    summary:
      "An overview of the CCPA's expanding action against misleading advertisements and unfair trade practices, including its power to fine advertisers and endorsers and to order corrective advertising.",
    companies: [],
    sectors: ['Misleading ads', 'Regulation'],
    category: 'law',
  },
  {
    id: 'indigo-deficiency-2026',
    title: 'Consumer commission fines IndiGo for deficiency in service over coerced lounge payment',
    source: 'MarketScreener',
    url: 'https://in.marketscreener.com/news/broken-assurances-coerced-payments-consumer-commission-fines-indigo-for-deficiency-in-service-ce7d5cdcdf8fff24',
    publishedAt: '2026-05-20',
    summary:
      'A consumer commission held IndiGo liable for deficiency in service — ordering refunds for a coerced lounge payment and a missed booking with 9% interest, plus ₹1,00,000 for mental agony and ₹20,000 towards costs.',
    companies: ['IndiGo'],
    sectors: ['Airlines'],
    category: 'breach',
  },
  {
    id: 'flynas-baggage-2026',
    title: 'Consumer panel asks Flynas Airlines to pay ₹1.25 lakh for baggage loss',
    source: 'The Tribune',
    url: 'https://www.tribuneindia.com/news/india/consumer-panel-asks-flynas-airlines-pay-rs-1-25-lakh-to-passenger-for-baggage-loss/amp',
    publishedAt: '2026-03-10',
    summary:
      'A district consumer commission directed Flynas Airlines to pay ₹1.25 lakh to a passenger for lost baggage, holding the airline responsible for the deficiency in service.',
    companies: ['Flynas'],
    sectors: ['Airlines'],
    category: 'breach',
  },
  {
    id: 'amazon-mosaic-expired-2026',
    title: 'Amazon and seller Mosaic Wellness held liable for selling expired products',
    source: 'LiveLaw (Consumer Law Digest)',
    url: 'https://www.livelaw.in/consumer-cases/consumer-law-monthly-digest-april-2026-533227',
    publishedAt: '2026-04-30',
    summary:
      "As reported in LiveLaw's monthly digest, the Thrissur District Commission held e-commerce platform Amazon Seller Services and seller Mosaic Wellness liable for selling expired products, ordering a refund with compensation.",
    companies: ['Amazon', 'Mosaic Wellness'],
    sectors: ['E-commerce'],
    category: 'breach',
  },
  {
    id: 'hdfc-consumer-definition-2026',
    title: "Overdraft user is still a 'consumer' — appeal against HDFC Bank allowed",
    source: 'LiveLaw (Consumer Law Digest)',
    url: 'https://www.livelaw.in/consumer-cases/consumer-law-monthly-digest-april-2026-533227',
    publishedAt: '2026-04-30',
    summary:
      "A State Commission ruled that merely availing an overdraft facility does not make a transaction 'commercial', so the complainant remained a 'consumer' entitled to relief — allowing the appeal against HDFC Bank.",
    companies: ['HDFC Bank'],
    sectors: ['Banking'],
    category: 'action',
  },
  {
    id: 'builder-delay-interest-2026',
    title: "Supreme Court strikes down builder's one-sided delay clause, orders 8% interest",
    source: 'Consumer case law (Parsvnath Developers v. Mohit Khirbat)',
    url: 'https://www.legitquest.com/legal-guide/top-7-consumer-protection-act-cases',
    publishedAt: '2026-02-15',
    summary:
      "In Parsvnath Developers v. Mohit Khirbat, the Supreme Court held a builder's clause offering only token interest for possession delays to be an unfair contract term, and directed the developer to pay 8% annual interest on amounts collected from home-buyers.",
    companies: ['Parsvnath Developers'],
    sectors: ['Housing / Real estate'],
    category: 'action',
  },
]
