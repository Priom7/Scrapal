// The planner is a conversation that leaves a plan behind. Every answer the
// student gives lands in the same profile the rest of the workspace reads, so
// talking and filling in a form are the same act — they just do not feel it.
import type { GalleryCourse } from '../../api'
import type { StudentProfile } from '../profile'

export type StepId =
  | 'greet' | 'subject' | 'level' | 'country' | 'grades' | 'english'
  | 'budget' | 'intake' | 'results' | 'costs' | 'open'
  | 'apply' | 'why' | 'experience' | 'goal' | 'pack'
  | 'asking' | 'drafts' | 'documents' | 'details' | 'referee'
  | 'research' | 'radarTerms'

export type Chip = {
  label: string
  /** What the student is taken to have said. Defaults to the label. */
  value?: string
  tone?: 'skip'
}

export type Card =
  | { kind: 'courses'; courseIds: string[]; more?: boolean }
  | { kind: 'answer'; question: string }
  | { kind: 'drafts' }
  | { kind: 'documents'; courseId: string }
  | { kind: 'statement'; courseId: string }
  | { kind: 'costs'; courseId: string }
  | { kind: 'application'; courseId: string }
  /* The Radar, in the thread. The terms travel on the card itself so the
     engine stays a pure state machine and the card owns its own fetching —
     the same split every other card here uses. */
  | { kind: 'radar-terms'; terms: string[]; discipline: string | null }
  | { kind: 'radar-matches'; terms: string[]; discipline: string | null; focus: 'people' | 'funding' }

export type Message = {
  id: string
  from: 'scrapal' | 'student'
  /** Marks the welcome-back line so a later visit replaces it instead of
      stacking another one on top. */
  kind?: 'resume'
  text?: string
  card?: Card
  chips?: Chip[]
}

export type PlannerState = {
  profile: StudentProfile
  subject: string | null
  step: StepId
  /** The course an application is being put together for. */
  applyingTo: string | null
  /** Answers in the student's own words, for the personal statement. */
  answers: Record<string, string>
  /** Terms from the student's research, once they have been shown and agreed.
      Only ever the fingerprint — the writing itself never leaves the thread. */
  research: { terms: string[]; discipline: string | null } | null
  /** Which half of the Radar they asked for, so the confirm step knows what to
      show once they say yes. */
  researchFocus: 'people' | 'funding'
  /** Where to return after an aside. A question mid-application must not lose
      the student's place. */
  resumeStack: StepId[]
  /** Steps already answered, so the thread never repeats itself. */
  done: StepId[]
  messages: Message[]
}

export type Answer = { text: string }

export type StepContext = {
  state: PlannerState
  courses: GalleryCourse[]
}
