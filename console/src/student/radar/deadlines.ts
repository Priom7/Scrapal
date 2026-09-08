// Deadlines in the words a person would use. Its own module because a component
// file that also exports helpers breaks fast refresh, and because both the
// Radar and the researcher profile need to phrase a closing date the same way.

function days(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

/** Close enough to act on now. */
export function urgent(iso: string): boolean {
  const left = days(iso)
  return left > 0 && left <= 30
}

export function relativeDeadline(iso: string): string {
  const left = days(iso)
  if (left < 0) return 'Closed'
  if (left === 0) return 'Closes today'
  if (left === 1) return 'Closes tomorrow'
  if (left < 60) return `Closes in ${left} days`
  return `Closes ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
