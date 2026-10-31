import { db } from '@/lib/db'

/**
 * Recompute project progress from milestone weights.
 * DONE and APPROVED milestones count toward completion.
 * Updates both project.progressPct and the parent request.progress.
 */
export async function recalcProjectProgress(projectId: string): Promise<number> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { milestones: true } })
  if (!project) return 0
  const totalWeight = project.milestones.reduce((s, m) => s + m.weight, 0)
  const doneWeight = project.milestones
    .filter((m) => m.status === 'DONE' || m.status === 'APPROVED')
    .reduce((s, m) => s + m.weight, 0)
  const pct = totalWeight > 0 ? Math.round(doneWeight / totalWeight * 100) : 0
  await db.project.update({ where: { id: projectId }, data: { progressPct: pct } })
  await db.serviceRequest.update({ where: { id: project.requestId }, data: { progress: pct } })
  return pct
}
