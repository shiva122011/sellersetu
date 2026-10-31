// Detailed per-service catalog content — imported by scripts/seed.ts.
// Every service gets its own description, scope, deliverables and a 4-step
// delivery process. No prices anywhere: commercial terms come from quotations.

export interface ProcessStep { t: string; d: string }

export interface ServiceDetailData {
  description: string
  scope: string[]
  deliverables: string[]
  process: ProcessStep[]
}

export const SD = (
  description: string,
  scope: string[],
  deliverables: string[],
  process: [string, string][],
): ServiceDetailData => ({
  description,
  scope,
  deliverables,
  process: process.map(([t, d]) => ({ t, d })),
})

export const FAQ = (q: string, a: string) => ({ q, a })
