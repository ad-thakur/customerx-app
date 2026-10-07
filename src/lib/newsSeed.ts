// Seed data for the Consumer Watch news index — a curated first pass produced
// by researching each sector. Real third-party articles, each stored as a link
// + a neutral, attributed summary + company/sector tags. We never reproduce the
// full article; the page points to the publisher. Once the recurring agent
// (server-side) is live, the page reads these rows from Postgres instead.
//
// category:  'law'    — consumer-protection laws, rules and regulator guidance
//            'breach' — a finding / penalty against a company
//            'action' — a consumer (or the courts on their behalf) securing a remedy

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
  // ---------------------------------------------------------------- Airlines
  {
    id: 'airindia-business-seat-livelaw',
    title: 'Passenger paid for business class, got a defective seat: NCDRC upholds compensation against Air India',
    source: 'LiveLaw',
    url: 'https://www.livelaw.in/consumer-cases/passenger-paid-for-business-class-got-defective-seat-ncdrc-upholds-compensation-against-air-india-539215',
    publishedAt: '2026-07-08',
    summary:
      'The NCDRC upheld an order directing Air India to refund the business-class fare with interest and pay ₹20 lakh compensation, holding the airline liable for deficiency in service after a passenger who paid an upgrade fee was given a non-reclining seat.',
    companies: ['Air India'],
    sectors: ['Airlines'],
    category: 'breach',
  },
  {
    id: 'airindia-business-seat-bt',
    title: 'This ₹20 lakh ruling against Air India is a win for every passenger',
    source: 'Business Today',
    url: 'https://www.businesstoday.in/latest/trends/story/flying-business-class-this-rs20-lakh-ruling-against-air-india-is-a-win-for-every-passenger-542042-2026-07-09',
    publishedAt: '2026-07-09',
    summary:
      'Business Today reports on a retired judicial officer who won a ₹20 lakh award against Air India for a defective business-class seat, framed as a precedent that airlines cannot charge premiums for sub-standard service.',
    companies: ['Air India'],
    sectors: ['Airlines'],
    category: 'action',
  },
  {
    id: 'airindia-baggage-sc',
    title: 'Supreme Court upholds NCDRC direction: Air India to pay ₹2.03 lakh for lost baggage',
    source: 'The Law Codes',
    url: 'https://thelawcodes.com/news/the-supreme-court-upholds-the-ncdrcs-directive-that-air-india-compensate-a-passenger-for-lost-baggage-with-rs-2-03-lakh/',
    publishedAt: '2026-05-15',
    summary:
      'The Supreme Court affirmed an NCDRC direction requiring Air India to compensate a passenger ₹2.03 lakh for lost baggage.',
    companies: ['Air India'],
    sectors: ['Airlines'],
    category: 'action',
  },
  {
    id: 'indigo-lounge-deficiency',
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
    id: 'flynas-baggage',
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

  // ---------------------------------------------------------------- Banking
  {
    id: 'pnb-atm-cloning',
    title: 'Punjab National Bank must pay ₹16.11 lakh to customer in ATM cloning case, rules NCDRC',
    source: 'Moneylife',
    url: 'https://moneylife.in/article/punjab-national-bank-must-pay-1611-lakh-to-customer-in-atm-cloning-case-rules-ncdrc/81000.html',
    publishedAt: '2026-06-30',
    summary:
      "The NCDRC upheld a direction for Punjab National Bank to reimburse ₹16.11 lakh, with 6% interest, to a customer whose account was emptied through cloned-ATM-card transactions in London, dismissing the bank's appeal against a finding of deficiency in service.",
    companies: ['Punjab National Bank'],
    sectors: ['Banking'],
    category: 'breach',
  },
  {
    id: 'sbi-cyber-fraud-refund',
    title: 'NCDRC upholds zero liability in SBI cyber fraud refund dispute',
    source: 'The420.in',
    url: 'https://the420.in/sbi-fake-electricity-message-cyber-fraud-ncdrc-refund-ruling/',
    publishedAt: '2026-04-18',
    summary:
      'The NCDRC directed SBI to refund ₹1.99 lakh and pay ₹25,000 compensation after a fake electricity-bill message led to unauthorised withdrawals, holding that timely reporting and lack of proven customer negligence attracted zero liability.',
    companies: ['State Bank of India'],
    sectors: ['Banking'],
    category: 'action',
  },
  {
    id: 'hdfc-fraudulent-transactions',
    title: 'Failure to reverse fraudulent transactions: NCDRC holds HDFC Bank liable for deficiency in service',
    source: 'LiveLaw',
    url: 'https://www.livelaw.in/consumer-cases/failure-to-reverse-fraudulent-transactions-ncdrc-holds-hdfc-bank-liable-for-deficiency-in-service-247945',
    publishedAt: '2026-02-20',
    summary:
      'The NCDRC held HDFC Bank liable for deficiency in service for failing to reverse fraudulent transactions on a customer despite a timely complaint.',
    companies: ['HDFC Bank'],
    sectors: ['Banking'],
    category: 'breach',
  },
  {
    id: 'hdfc-overdraft-consumer',
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
    id: 'commercial-loans-consumer-act',
    title: 'Does the Consumer Protection Act apply to commercial loans? Supreme Court examines',
    source: 'Supreme Court Observer',
    url: 'https://www.scobserver.in/supreme-court-observer-law-reports-scolr/applicability-of-consumer-act-to-commercial-loans-the-chief-manager-central-bank-of-india-v-m-s-ad-bureau-advertising/',
    publishedAt: '2026-01-30',
    summary:
      "A report on the Supreme Court examining when a borrower counts as a 'consumer' under the Consumer Protection Act, and where commercial-purpose loans fall outside its protection.",
    companies: ['Central Bank of India'],
    sectors: ['Banking'],
    category: 'law',
  },

  // ---------------------------------------------------------------- Insurance
  {
    id: 'united-india-wrongful-rejection',
    title: 'Wrongful rejection of claim: NCDRC directs United India Insurance to pay compensation',
    source: 'LiveLaw',
    url: 'https://www.livelaw.in/consumer-cases/wrongful-rejection-of-claim-ncdrc-directs-united-india-insurance-to-pay-compensation-to-dcw-ltd-235363',
    publishedAt: '2026-03-05',
    summary:
      'The NCDRC held that United India Insurance wrongfully rejected a claim and directed it to pay compensation to the insured.',
    companies: ['United India Insurance'],
    sectors: ['Insurance'],
    category: 'breach',
  },
  {
    id: 'lic-6-lakh-public-duty',
    title: 'NCDRC orders LIC to pay ₹6 lakh: public-service duties require fulfilling insurance obligations',
    source: 'Bimabazaar',
    url: 'https://bimabazaar.com/knowledge-research/caselaws/ncdrc-orders-lic-to-pay-rs-6-lakhs-public-service-duties-require-fulfilling-insurance-obligations',
    publishedAt: '2026-02-12',
    summary:
      "The NCDRC affirmed a State Commission order requiring LIC to pay the full policy amount plus ₹6 lakh, holding that a public insurer's duties require honouring its obligations.",
    companies: ['Life Insurance Corporation of India'],
    sectors: ['Insurance'],
    category: 'action',
  },
  {
    id: 'new-india-fire-surveyor',
    title: "NCDRC upholds surveyor's report, adjusts compensation against New India Assurance in fire claim",
    source: '24Law',
    url: 'https://www.24law.in/story/ncdrc-upholds-surveyor-s-report-reduces-compensation-against-new-india-assurance-in-fire-insurance',
    publishedAt: '2026-04-02',
    summary:
      "In a fire-insurance dispute, the NCDRC relied on the surveyor's assessment while adjusting the compensation payable by New India Assurance.",
    companies: ['New India Assurance'],
    sectors: ['Insurance'],
    category: 'breach',
  },
  {
    id: 'insurance-5cr-film-distributor',
    title: 'NCDRC verdict in high-value insurance claim: distributor entitled to ₹5 crore',
    source: 'Insurance India',
    url: 'https://www.insuranceindiaa.in/ncdrc-verdict-in-high-value-insurance-claim-case/',
    publishedAt: '2026-03-25',
    summary:
      'The NCDRC ruled in favour of a film distributor whose ₹5 crore claim had been rejected on exemption grounds, rejecting the insurer’s arguments and holding the distributor entitled to compensation.',
    companies: [],
    sectors: ['Insurance'],
    category: 'action',
  },
  {
    id: 'insurance-farmer-interest',
    title: 'Insurance firm directed to compensate farmer with interest',
    source: 'The Tribune',
    url: 'https://www.tribuneindia.com/news/haryana/firm-directed-to-compensate-farmer-with-interest-549556',
    publishedAt: '2026-05-08',
    summary:
      'A consumer commission directed an insurer to compensate a farmer, with interest, for a wrongly handled claim.',
    companies: [],
    sectors: ['Insurance'],
    category: 'action',
  },

  // ---------------------------------------------------------------- Healthcare
  {
    id: 'max-hospital-mohali',
    title: 'Unexplained contradictions in records: consumer court upholds ₹32.94 lakh against Max Hospital Mohali',
    source: 'Medical Dialogues',
    url: 'https://medicaldialogues.in/news/health/medico-legal/unexplained-contradictions-in-medical-records-consumer-court-upholds-negligence-rs-3294-lakh-compensation-against-max-hospital-mohali-cardiologist-177208',
    publishedAt: '2026-08-05',
    summary:
      'The NCDRC upheld a finding of medical negligence and ₹32.94 lakh compensation against Max Hospital, Mohali and a cardiologist, citing unexplained contradictions across medical records, reports and billing.',
    companies: ['Max Hospital'],
    sectors: ['Healthcare'],
    category: 'breach',
  },
  {
    id: 'wrong-kidney-2cr',
    title: 'NCDRC awards ₹2 crore after surgeon removes a healthy kidney',
    source: 'SCC Online',
    url: 'https://www.scconline.com/blog/post/2026/05/25/ncdrc-wrong-kidney-removal-medical-negligence-2-crore-compensation/',
    publishedAt: '2026-05-25',
    summary:
      "The NCDRC held a surgeon liable for gross medical negligence for removing a woman's healthy kidney instead of the diseased one, awarding her family ₹2 crore in total compensation.",
    companies: [],
    sectors: ['Healthcare'],
    category: 'breach',
  },
  {
    id: 'ncdrc-doctor-10-lakh',
    title: 'NCDRC holds doctor liable for medical negligence but reduces compensation to ₹10 lakh',
    source: 'LiveLaw',
    url: 'https://www.livelaw.in/consumer-cases/ncdrc-holds-doctor-liable-for-medical-negligence-but-reduces-compensation-from-rs-30-lakhs-to-rs-10-lakhs-295494',
    publishedAt: '2026-03-18',
    summary:
      'The NCDRC affirmed a doctor’s liability for medical negligence while reducing the compensation from ₹30 lakh to ₹10 lakh.',
    companies: [],
    sectors: ['Healthcare'],
    category: 'breach',
  },
  {
    id: 'hospital-8-lakh-negligence',
    title: 'Hospital told to pay ₹8 lakh compensation for negligence',
    source: 'The Tribune',
    url: 'https://www.tribuneindia.com/news/chandigarh/hospital-told-to-pay-rs-8-lakh-compensation-for-negligence-636135',
    publishedAt: '2026-06-11',
    summary:
      'A consumer commission directed a hospital to pay ₹8 lakh compensation to a patient for deficiency in service and negligence.',
    companies: [],
    sectors: ['Healthcare'],
    category: 'breach',
  },
  {
    id: 'sc-quashes-negligence',
    title: 'Supreme Court reverses NCDRC negligence finding for lack of evidence',
    source: 'Lawtext',
    url: 'https://lawtext.in/judgement.php?bid=5072',
    publishedAt: '2026-02-28',
    summary:
      'The Supreme Court set aside a negligence finding against a doctor and hospital, holding that an unfavourable outcome does not by itself amount to negligence and that the complainant led insufficient medical evidence.',
    companies: [],
    sectors: ['Healthcare'],
    category: 'law',
  },

  // ------------------------------------------------------------- Real estate
  {
    id: 'ncdrc-delayed-possession',
    title: 'NCDRC holds builder liable for delayed possession, grants refund or possession to homebuyers',
    source: 'LiveLaw',
    url: 'https://www.livelaw.in/consumer-cases/ncdrc-holds-builder-liable-for-delayed-possession-grants-refund-or-possession-to-homebuyers-539773',
    publishedAt: '2026-07-02',
    summary:
      'The NCDRC held a builder liable for delayed possession and gave homebuyers the option of a refund with interest or possession with compensation.',
    companies: [],
    sectors: ['Real estate'],
    category: 'breach',
  },
  {
    id: 'sc-compensation-after-possession',
    title: 'Supreme Court: homebuyers can seek delay compensation even after taking possession',
    source: 'Business Standard',
    url: 'https://www.business-standard.com/india-news/sc-allows-homebuyers-to-seek-compensation-for-delay-after-taking-possession-126062700302_1.html',
    publishedAt: '2026-06-27',
    summary:
      'The Supreme Court held that taking possession does not by itself extinguish a homebuyer’s right to seek adjudication of a claim for compensation for delayed possession.',
    companies: [],
    sectors: ['Real estate'],
    category: 'action',
  },
  {
    id: 'ncdrc-oc-irrelevant',
    title: 'NCDRC: occupancy certificate is irrelevant to a refund claim if possession is delayed',
    source: 'PropNewsTime',
    url: 'https://propnewstime.com/latestnewsstories/NjQyNg==/ncdrc-rules-obtaining-occupancy-certificate-irrelevant-for-refund-claim-if-possession-is-delayed',
    publishedAt: '2026-05-12',
    summary:
      'The NCDRC ruled that the date of receiving an occupancy certificate is irrelevant to homebuyers when possession is not offered on time, allowing a refund claim.',
    companies: [],
    sectors: ['Real estate'],
    category: 'breach',
  },
  {
    id: 'rera-digest-march-2026',
    title: 'RERA cases monthly digest: March 2026',
    source: 'LiveLaw (RERA)',
    url: 'https://www.livelawbiz.com/rera/rera-cases-monthly-digest-march-2026-528523',
    publishedAt: '2026-03-31',
    summary:
      'A monthly roundup of RERA and consumer-forum orders on builder delays, refunds and homebuyer compensation.',
    companies: [],
    sectors: ['Real estate', 'Regulation'],
    category: 'law',
  },
  {
    id: 'sc-possession-delay-interest',
    title: "Supreme Court reinforces homebuyers' right to reasonable compensation for possession delay",
    source: 'India Legal News',
    url: 'https://indialegalnews.com/2026/03/01/supreme-courts-resonable-compensation-for-possession-delay-latest/',
    publishedAt: '2026-03-01',
    summary:
      'The Supreme Court reinforced that builders cannot force buyers to take possession after unreasonable delay and must offer a refund with fair compensation, with interest directed on refund amounts.',
    companies: [],
    sectors: ['Real estate'],
    category: 'action',
  },

  // ------------------------------------------------------------- E-commerce
  {
    id: 'ccpa-marketplaces-walkie-talkie',
    title: 'CCPA fines Amazon, Flipkart, Meesho and Meta ₹10 lakh each over illegal walkie-talkie listings',
    source: 'Storyboard18',
    url: 'https://www.storyboard18.com/how-it-works/ccpa-fines-amazon-flipkart-meesho-and-meta-%E2%82%B910-lakh-each-over-illegal-walkie-talkie-listings-89370.htm',
    publishedAt: '2026-08-01',
    summary:
      'The CCPA imposed penalties of ₹10 lakh each on Amazon, Flipkart, Meesho and Meta for allowing listings of unlicensed walkie-talkies, a consumer-safety and unfair-trade concern.',
    companies: ['Amazon', 'Flipkart', 'Meesho', 'Meta'],
    sectors: ['E-commerce'],
    category: 'breach',
  },
  {
    id: 'amazon-mosaic-expired',
    title: 'Amazon and seller Mosaic Wellness held liable for selling expired products',
    source: 'LiveLaw (Consumer Law Digest)',
    url: 'https://www.livelaw.in/consumer-cases/consumer-law-monthly-digest-april-2026-533227',
    publishedAt: '2026-04-30',
    summary:
      "As reported in LiveLaw's monthly digest, the Thrissur District Commission held Amazon Seller Services and seller Mosaic Wellness liable for selling expired products, ordering a refund with compensation.",
    companies: ['Amazon', 'Mosaic Wellness'],
    sectors: ['E-commerce'],
    category: 'breach',
  },
  {
    id: 'amazon-defective-tv-mumbai',
    title: 'Can you sue an online shopping platform? Mumbai commission makes Amazon pay for a defective TV',
    source: 'The Law Communicants',
    url: 'https://thelawcommunicants.com/can-you-sue-an-online-shopping-platform-consumer-rights-in-india/',
    publishedAt: '2026-01-22',
    summary:
      "A Mumbai District Commission rejected Amazon's 'intermediary' defence in a defective-television dispute and directed a refund with compensation, illustrating platform liability under the Consumer Protection Act.",
    companies: ['Amazon'],
    sectors: ['E-commerce'],
    category: 'breach',
  },
  {
    id: 'ecommerce-complaints-list',
    title: 'Flipkart tops consumer complaints list; Amazon, Meesho follow',
    source: 'Business Today',
    url: 'https://www.businesstoday.in/latest/trends/story/think-your-online-order-is-safe-flipkart-tops-consumer-complaints-list-amazon-meesho-follow-548918-2026-08-13',
    publishedAt: '2026-08-13',
    summary:
      'National Consumer Helpline data shared in Parliament shows Flipkart, Amazon and Meesho among the most-complained-about e-commerce platforms in 2025.',
    companies: ['Flipkart', 'Amazon', 'Meesho'],
    sectors: ['E-commerce'],
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
    id: 'ccpa-ecommerce-price-display',
    title: 'CCPA fines an e-commerce company ₹2 lakh for misleading price display',
    source: 'NewsOnAir',
    url: 'https://www.newsonair.gov.in/ccpa-fines-e-commerce-company-%e2%82%b92-lakh-for-misleading-price-display',
    publishedAt: '2025-09-26',
    summary:
      'The CCPA penalised an e-commerce company ₹2 lakh for a misleading price display amounting to an unfair trade practice.',
    companies: [],
    sectors: ['E-commerce', 'Misleading ads'],
    category: 'breach',
  },

  // -------------------------------------------------------- Food & beverages
  {
    id: 'ccpa-100-percent',
    title: "CCPA penalises Storia Foods and English Oven over '100%' label claims",
    source: 'Chambers & Partners',
    url: 'https://chambers.com/articles/ccpa-penalises-100-claims-what-india-s-latest-misleading-advertising-ruling-means-for-fmcg-and-c',
    publishedAt: '2026-06-18',
    summary:
      "The CCPA fined Storia Foods & Beverages and Mrs. Bector's Food Specialities (English Oven) ₹1 lakh each and ordered them to drop '100%' composition claims from packaging, websites and marketplace listings.",
    companies: ['Storia Foods & Beverages', "Mrs. Bector's Food Specialities", 'English Oven'],
    sectors: ['Food & beverages', 'Misleading ads'],
    category: 'breach',
  },
  {
    id: 'outlook-100-bluff',
    title: "The '100%' bluff: when food labels promise more than they deliver",
    source: 'Outlook Business',
    url: 'https://www.outlookbusiness.com/corporate/the-100-bluff-when-food-labels-promise-more-than-they-deliver',
    publishedAt: '2026-06-25',
    summary:
      "An analysis of the CCPA's '100%' rulings and what they mean for how packaged-food brands may word composition and 'natural' claims.",
    companies: [],
    sectors: ['Food & beverages', 'Misleading ads'],
    category: 'law',
  },
  {
    id: 'fssai-food-ads-celebrities',
    title: 'Food ads, celebrities and the law: what happens when a claim is misleading?',
    source: 'Outlook Business',
    url: 'https://www.outlookbusiness.com/news/fssai-food-ads-celebrities-and-the-law-what-happens-when-a-claim-is-misleading',
    publishedAt: '2026-07-10',
    summary:
      'A look at how the CCPA and FSSAI treat misleading food advertising, including the liability of brands and celebrity endorsers.',
    companies: [],
    sectors: ['Food & beverages', 'Misleading ads'],
    category: 'law',
  },
  {
    id: 'tribune-food-claims-safety',
    title: 'How misleading food claims undermine consumer safety',
    source: 'The Tribune',
    url: 'https://www.tribuneindia.com/news/in-depth/how-misleading-food-claims-undermine-consumer-safety/',
    publishedAt: '2026-07-05',
    summary:
      'An in-depth piece on how misleading claims on food packaging affect consumer choices and safety, and the regulatory response.',
    companies: [],
    sectors: ['Food & beverages'],
    category: 'law',
  },
  {
    id: 'food-regulators-notice-claims',
    title: "India's food regulators put '100%', 'Natural' and 'Energy' claims on notice",
    source: 'Kan and Krishme',
    url: 'https://kankrishme.com/indias-food-regulators-put-100-natural-and-energy-claims-on-notice/',
    publishedAt: '2026-06-30',
    summary:
      "A summary of regulatory scrutiny of common food-label claims such as '100%', 'natural' and 'energy', following CCPA and FSSAI action.",
    companies: [],
    sectors: ['Food & beverages', 'Misleading ads', 'Regulation'],
    category: 'law',
  },

  // -------------------------------------------------------------- Automobiles
  {
    id: 'auto-continuous-repair-defect',
    title: 'Continuous repair in a newly purchased vehicle is a manufacturing defect: NCDRC',
    source: 'India Legal',
    url: 'https://indialegallive.com/constitutional-law-news/courts-news/continuous-repair-in-newly-purchased-vehicle-is-a-manufacturing-defect-ncdrc/',
    publishedAt: '2026-04-15',
    summary:
      'The NCDRC held that a newly purchased vehicle requiring continuous repairs points to a manufacturing defect, supporting relief for the buyer.',
    companies: [],
    sectors: ['Automobiles'],
    category: 'breach',
  },
  {
    id: 'auto-tt-motors-suffering',
    title: 'Compensation includes physical, mental or emotional suffering: NCDRC on deficient car service',
    source: 'The Law Suits',
    url: 'https://thelawsuits.in/national-commission-compensation-deficient-car-service-t-t-motors/',
    publishedAt: '2026-03-22',
    summary:
      'In a deficient car-service dispute involving a dealer, the NCDRC held that compensation can cover physical, mental and emotional suffering, not just monetary loss.',
    companies: ['T T Motors'],
    sectors: ['Automobiles'],
    category: 'breach',
  },
  {
    id: 'auto-burden-of-proof',
    title: 'Burden of proof to show a manufacturing defect is on the complainant: NCDRC',
    source: 'LiveLaw',
    url: 'https://www.livelaw.in/consumer-cases/ncdrc-burden-of-proof-manufacturing-defect-complainant-260956',
    publishedAt: '2026-02-05',
    summary:
      'The NCDRC reiterated that a consumer alleging a manufacturing defect must establish it, ordinarily through expert evidence.',
    companies: [],
    sectors: ['Automobiles'],
    category: 'law',
  },
  {
    id: 'auto-skoda-overturned',
    title: "Frequent repairs don't always indicate a manufacturing defect: NCDRC overturns order against Skoda Volkswagen",
    source: '24Law',
    url: 'https://www.24law.in/story/frequent-repairs-don-t-always-indicate-manufacturing-defect-ncdrc-overturns-order-against-skoda',
    publishedAt: '2026-05-30',
    summary:
      'The NCDRC set aside an order against Skoda Volkswagen India, holding that frequent repairs alone do not establish an inherent manufacturing defect without supporting evidence.',
    companies: ['Skoda Volkswagen India'],
    sectors: ['Automobiles'],
    category: 'law',
  },

  // ---------------------------------------------------------------- Telecom
  {
    id: 'jiofiber-poor-service',
    title: 'Consumer commission holds JioFiber guilty of poor service, orders ₹10,000 compensation',
    source: 'Business Today',
    url: 'https://www.businesstoday.in/latest/trends/story/consumer-commission-holds-jiofiber-guilty-of-poor-service-orders-rs10000-compensation-545214-2026-07-25',
    publishedAt: '2026-07-25',
    summary:
      'A District Commission held Reliance JioFiber guilty of deficiency in service and unfair trade practice after repeated outages, directing ₹10,000 compensation and free restoration of the connection.',
    companies: ['Reliance JioFiber'],
    sectors: ['Telecom'],
    category: 'breach',
  },
  {
    id: 'bsnl-30000-service-lapse',
    title: 'Consumer court orders BSNL to pay ₹30,000 for service lapse',
    source: 'News Karnataka',
    url: 'https://newskarnataka.com/mangaluru/consumer-court-orders-bsnl-to-pay-%E2%82%B930000-for-service-lapse/04052026',
    publishedAt: '2026-05-04',
    summary:
      'A consumer court directed BSNL to pay ₹30,000 to a resident for prolonged internet disruption — ₹25,000 for deficiency in service and mental agony and ₹5,000 towards litigation costs.',
    companies: ['BSNL'],
    sectors: ['Telecom'],
    category: 'breach',
  },
  {
    id: 'jio-slow-internet',
    title: 'Court orders Jio to pay ₹19,700 to a user having slow internet',
    source: 'Trak.in',
    url: 'https://trak.in/stories/court-orders-jio-to-pay-rs-19700-to-user-having-slow-internet/',
    publishedAt: '2026-04-20',
    summary:
      'A consumer forum directed Reliance Jio to compensate a user ₹19,700 over persistently slow internet speeds amounting to deficiency in service.',
    companies: ['Reliance Jio'],
    sectors: ['Telecom'],
    category: 'breach',
  },

  // ------------------------------------------------------ Misleading ads / edu
  {
    id: 'ccpa-coaching-upsc',
    title: 'CCPA fines UPSC coaching institutes for misleading success-rate claims',
    source: 'Careers360',
    url: 'https://news.careers360.com/ccpa-fines-three-coaching-institutes-for-misleading-upsc-exam-claims/amp',
    publishedAt: '2026-05-31',
    summary:
      'The CCPA penalised coaching institutes for misleading advertisements about UPSC success rates, treating exaggerated selection claims as an unfair trade practice.',
    companies: [],
    sectors: ['Misleading ads'],
    category: 'breach',
  },
  {
    id: 'ccpa-misleading-ads-overview',
    title: 'CCPA steps up enforcement against misleading advertisements',
    source: 'InsightsOnIndia',
    url: 'https://www.insightsonindia.com/2026/09/07/the-central-consumer-protection-authority-ccpa/',
    publishedAt: '2026-09-07',
    summary:
      "An overview of the CCPA's expanding action against misleading advertisements and unfair trade practices, including its power to fine advertisers and endorsers and order corrective advertising.",
    companies: [],
    sectors: ['Misleading ads', 'Regulation'],
    category: 'law',
  },
]
