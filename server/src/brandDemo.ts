// Sample complaints for brand demos. Written to span the range a real queue
// shows — a strong case that should be settled, a frivolous one, a safety
// issue, a time-barred one, a vague angry one — so every part of the analysis
// has something to say. Names and order numbers are invented.

import type { NewComplaint } from './brandStore.js'

function daysAgo(d: number, hour = 11): string {
  const t = new Date(Date.now() - d * 86_400_000)
  t.setHours(hour, 17 * d % 60, 0, 0)
  return t.toISOString()
}

function dateAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

export function demoComplaints(brand: string): NewComplaint[] {
  const base = {
    consumerPhone: '',
    purchaseDate: null as string | null,
    amountClaimed: null as number | null,
    orderRef: '',
    product: '',
  }
  return [
    {
      ...base,
      source: 'email',
      consumerName: 'Ritika Sharma',
      consumerEmail: 'ritika.sharma@example.com',
      subject: 'Washing machine failed 3 times in 5 months — want replacement',
      body: `I bought a ${brand} 8kg front load washing machine on ${dateAgo(150)} (invoice no. INV-58213, ₹38,990). It is under warranty. The drum stops mid-cycle and shows error E21. Your technician has visited three times (ticket no. SR-20931, SR-21544, SR-22870) and replaced the drain pump and then the PCB, but the problem keeps coming back. I have photos and videos of the error. I have emailed customer care twice with no resolution. I want a replacement or full refund, otherwise I will be forced to approach the consumer commission.`,
      receivedAt: daysAgo(1, 9),
    },
    {
      ...base,
      source: 'web',
      consumerName: 'Arjun Mehta',
      consumerEmail: 'arjun.m@example.com',
      subject: 'Late delivery',
      body: `My earphones were delivered 2 days late. This is pathetic service. I demand 50 lakh compensation for mental harassment or I will sue ${brand}.`,
      amountClaimed: 999,
      product: 'Wireless earphones',
      receivedAt: daysAgo(0, 10),
    },
    {
      ...base,
      source: 'email',
      consumerName: 'Fatima Khan',
      consumerEmail: 'fatima.khan@example.com',
      subject: 'URGENT: charger sparked and burnt the socket',
      body: `The fast charger that came with my ${brand} phone sparked last night while charging and burnt the wall socket. There was smoke and my son was nearby. I have photos of the burnt charger and socket. Order number OD-4471-2290, phone price ₹24,999, bought ${dateAgo(60)}. I want to know how this is safe. Please respond immediately.`,
      receivedAt: daysAgo(0, 8),
    },
    {
      ...base,
      source: 'web',
      consumerName: 'Suresh Iyer',
      consumerEmail: 'suresh.iyer@example.com',
      subject: 'Refund for cancelled order not received',
      body: `I cancelled order ORD-77812 (air purifier, ₹12,499) before dispatch on ${dateAgo(25)}. You confirmed the cancellation by email and said the refund would be processed in 5-7 working days. It has been more than 3 weeks. I have called customer care 4 times, complaint reference no. CC-55120. Every time I am told it is "in process". Please refund my money.`,
      receivedAt: daysAgo(3, 14),
    },
    {
      ...base,
      source: 'hosted',
      consumerName: 'Neha Gupta',
      consumerEmail: 'neha.g@example.com',
      subject: 'Charged more than MRP at your store',
      body: `At the ${brand} store in Phoenix Mall, Pune I was charged ₹2,350 for a trimmer whose MRP printed on the box is ₹1,999. I have the bill (receipt no. 004512) and a photo of the box. The staff said it was "installation charges" for a trimmer. This is overcharging above MRP.`,
      amountClaimed: 2350,
      receivedAt: daysAgo(4, 16),
    },
    {
      ...base,
      source: 'email',
      consumerName: 'Vikram Singh',
      consumerEmail: 'vikram.s@example.com',
      subject: 'Battery backup nowhere near advertised',
      body: `Your website and the box both claim "up to 2 days battery life" for the ${brand} smartwatch. Mine barely lasts 9 hours with normal use. I bought it on ${dateAgo(40)} for ₹8,499 (order ID AMZ-30019). Service centre says it is "normal". This is a misleading advertisement. I want a refund.`,
      receivedAt: daysAgo(2, 12),
    },
    {
      ...base,
      source: 'email',
      consumerName: 'Prakash Rao',
      consumerEmail: 'prakash.rao@example.com',
      subject: 'Refrigerator compressor failure',
      body: `My ${brand} refrigerator bought in March ${new Date().getFullYear() - 4} has stopped cooling. The compressor has failed. I want a free replacement of the refrigerator as your product is of poor quality. Price was ₹32,000.`,
      purchaseDate: `${new Date().getFullYear() - 4}-03-10`,
      receivedAt: daysAgo(6, 10),
    },
    {
      ...base,
      source: 'web',
      consumerName: 'Anil Kumar',
      consumerEmail: 'anil.k@example.com',
      subject: 'worst company',
      body: `worst company ever, useless products, cheats. never buying again`,
      receivedAt: daysAgo(5, 19),
    },
    {
      ...base,
      source: 'hosted',
      consumerName: 'Deepa Nair',
      consumerEmail: 'deepa.nair@example.com',
      subject: 'AC installation not done for 2 weeks',
      body: `I purchased a ${brand} 1.5 ton split AC on ${dateAgo(18)}, invoice INV-90211, ₹41,500 including installation. The AC was delivered but the installation technician has not come despite 3 scheduled appointments. Complaint no. INS-7781. It is very hot and the AC is lying in the box. Please install it or refund.`,
      receivedAt: daysAgo(2, 9),
    },
  ]
}
