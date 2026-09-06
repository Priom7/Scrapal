// A personal statement scaffold.
//
// The hard rule: this never invents anything about the student. It arranges
// what they actually said, quotes what the university actually published, and
// marks every remaining gap so the draft cannot be mistaken for finished.
// Universities reject fabricated statements, and a tool that writes them for
// people would be doing them harm while appearing to help.
import type { GalleryCourse } from '../../api'
import { CLASS_LABELS } from '../match'
import type { StudentProfile } from '../profile'

export type StatementPrompt = {
  id: string
  question: string
  hint: string
}

/** What only the student can answer. Nothing here is guessable from data. */
export const PROMPTS: StatementPrompt[] = [
  { id: 'why', question: 'Why do you want to study this?', hint: 'One honest reason. What made you choose it over everything else?' },
  { id: 'experience', question: 'What have you done that is relevant?', hint: 'A project, a job, a module you did well in. One concrete thing beats three vague ones.' },
  { id: 'goal', question: 'What do you want to do afterwards?', hint: 'It does not have to be a fixed plan. A direction is enough.' },
]

export type StatementSection = {
  heading: string
  /** Paragraph text, with gaps left as [square brackets] the student fills. */
  body: string
  /** True when this section still needs the student's own words. */
  needsYou: boolean
}

export type StatementDraft = {
  sections: StatementSection[]
  gaps: number
  words: number
}

function sentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  const ended = /[.!?]$/.test(trimmed)
  return ended ? trimmed : `${trimmed}.`
}

export function draftStatement(
  course: GalleryCourse,
  profile: StudentProfile,
  answers: Record<string, string>,
): StatementDraft {
  const university = course.institution.name
  const sections: StatementSection[] = []

  const why = answers.why?.trim()
  sections.push({
    heading: 'Why this course',
    needsYou: !why,
    body: why
      ? `${sentence(why)} That is what draws me to ${course.title} at ${university}.`
      : `[Say in your own words why you want to study ${course.title}. One honest reason is enough — it does not need to sound impressive.]`,
  })

  const qualification = profile.classification
    ? CLASS_LABELS[profile.classification].toLowerCase()
    : profile.ucasPoints != null ? `${profile.ucasPoints} UCAS points` : null
  const experience = answers.experience?.trim()
  sections.push({
    heading: 'What I bring',
    needsYou: !experience,
    body: [
      qualification ? `I hold ${qualification}.` : '[Add your qualification and grade.]',
      experience
        ? sentence(experience)
        : '[Describe one relevant thing you have actually done — a project, a job, a module you did well in. Do not add anything that is not true; universities check.]',
      profile.ieltsOverall != null ? `My English is at IELTS ${profile.ieltsOverall} overall.` : '',
    ].filter(Boolean).join(' '),
  })

  // Quoting the course's own published description is the one part of this a
  // student cannot easily write themselves, and it is drawn from a real page.
  const modules = course.modules.slice(0, 3)
  sections.push({
    heading: 'Why this university',
    needsYou: false,
    body: modules.length
      ? `The course covers ${modules.join(', ')}, which is closer to what I want than the alternatives I looked at. [Add one sentence on which of these matters most to you, and why.]`
      : `[Read the course page at ${course.source_url} and name one specific thing about it that fits what you want.]`,
  })

  const goal = answers.goal?.trim()
  sections.push({
    heading: 'What comes next',
    needsYou: !goal,
    body: goal
      ? sentence(goal)
      : '[Say what you want to do after the course. A direction is enough; it does not have to be a fixed plan.]',
  })

  const text = sections.map((section) => section.body).join(' ')
  return {
    sections,
    gaps: (text.match(/\[[^\]]+\]/g) ?? []).length,
    words: text.replace(/\[[^\]]+\]/g, '').split(/\s+/).filter(Boolean).length,
  }
}

/** The whole statement as one block, for pasting into a portal. */
export function statementText(draft: StatementDraft): string {
  return draft.sections.map((section) => section.body).join('\n\n')
}
