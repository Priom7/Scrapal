// Turning answers into a conversation and a plan.
//
// Pure on purpose: given a state and what the student said, it returns the next
// state. No timers, no fetching, no React — so the whole interview can be
// tested by playing it through.
import { EMPTY_PROFILE, type StudentProfile } from '../profile'
import { listApplications, readApplication, setAnswer, setReferee, setStatus, startApplication } from '../apply/store'
import { fingerprint, isEmpty } from '../radar/fingerprint'
import { loadTerms, saveTerms } from '../radar/savedTerms'
import { isSkip, shortlist, stepById, type StepResult } from './script'
import type { Chip, Message, PlannerState, StepContext } from './types'

/** What to call the place a student was, when offering to take them back. */
const STEP_LABELS: Partial<Record<PlannerState['step'], string>> = {
  why: 'your application',
  experience: 'your application',
  goal: 'your application',
  pack: 'your application',
  apply: 'starting your application',
  subject: 'planning',
  level: 'planning',
  country: 'planning',
  grades: 'planning',
  english: 'planning',
  budget: 'planning',
  intake: 'planning',
  results: 'your courses',
  costs: 'the costs',
}

/** A question is anything shaped like one. Students interrupt themselves. */
export function looksLikeAQuestion(text: string): boolean {
  const lower = text.trim().toLowerCase()
  if (lower.endsWith('?')) return true
  return /^(what|how|when|where|which|who|why|can|could|do|does|did|is|are|will|would|should|tell me)\b/.test(lower)
}

let counter = 0
function id(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export function initialState(profile: StudentProfile = EMPTY_PROFILE): PlannerState {
  return {
    profile, subject: null, step: 'greet', applyingTo: null,
    research: null, researchFocus: 'people',
    answers: {}, resumeStack: [], done: [], messages: [],
  }
}

function applyToProfile(profile: StudentProfile, patch: Partial<StepResult>): StudentProfile {
  const next = { ...profile }
  if ('classification' in patch) next.classification = patch.classification ?? null
  if ('ucasPoints' in patch) next.ucasPoints = patch.ucasPoints ?? null
  if ('ieltsOverall' in patch) next.ieltsOverall = patch.ieltsOverall ?? null
  if ('ieltsLowest' in patch) next.ieltsLowest = patch.ieltsLowest ?? null
  if ('budget' in patch) next.budget = patch.budget ?? null
  if ('intake' in patch) next.intake = patch.intake ?? null
  if ('level' in patch) next.level = patch.level ?? null
  if ('countries' in patch) next.countries = patch.countries ?? []
  if ('name' in patch && patch.name) next.name = patch.name
  return next
}

/** What Scrapal says when it arrives at a step, plus anything it shows. */
function speak(state: PlannerState, context: StepContext): Message[] {
  if (state.step === 'results') {
    const found = shortlist({ ...context, state })
    if (!found.length) {
      return [{
        id: id('m'),
        from: 'scrapal',
        text: 'Nothing published matches all of that yet. Widening one thing usually opens it up — shall I drop the subject and show what else fits?',
        chips: [{ label: 'Show me anyway', value: 'show me courses' }, { label: 'Start again', value: 'restart' }],
      }]
    }
    return [
      {
        id: id('m'),
        from: 'scrapal',
        text: found.length === 1
          ? 'Here is one that fits what you have told me.'
          : `Here are ${found.length} that fit what you have told me, closest first.`,
      },
      { id: id('m'), from: 'scrapal', card: { kind: 'courses', courseIds: found.map((course) => course.id) } },
      {
        id: id('m'),
        from: 'scrapal',
        text: 'Want me to work out what one of these would actually cost you, over the whole course?',
        chips: [
          { label: 'Yes, show me the costs', value: 'costs' },
          { label: 'Change something', value: 'restart' },
          { label: 'I have a question', value: 'ask' },
        ],
      },
    ]
  }

  if (state.step === 'costs') {
    const found = shortlist({ ...context, state }, 1)
    if (!found.length) {
      return [{ id: id('m'), from: 'scrapal', text: 'Pick a course first and I will price it up.' }]
    }
    return [
      { id: id('m'), from: 'scrapal', text: `This is what ${found[0].title} would cost you, start to finish.` },
      { id: id('m'), from: 'scrapal', card: { kind: 'costs', courseId: found[0].id } },
      {
        id: id('m'),
        from: 'scrapal',
        text: 'Shall I get an application ready for one of these? I can build the document list and draft the statement around what you tell me.',
        chips: [
          { label: 'Yes, start my application', value: 'apply' },
          { label: 'Check something I was told', value: 'claim' },
          { label: 'Change my details', value: 'restart' },
        ],
      },
    ]
  }

  if (state.step === 'apply') {
    const found = shortlist({ ...context, state })
    if (!found.length) {
      return [{ id: id('m'), from: 'scrapal', text: 'Find a course you like first and I will get it ready.' }]
    }
    return [{
      id: id('m'),
      from: 'scrapal',
      text: 'Which one shall we get ready? I will build the document list from that university’s own requirements, and draft the statement around what you tell me.',
      chips: found.map((course) => ({ label: `${course.title} · ${course.institution.name}`, value: `apply:${course.id}` })),
    }]
  }

  if (state.step === 'pack') {
    const courseId = state.applyingTo
    if (!courseId) return [{ id: id('m'), from: 'scrapal', text: 'Pick a course and I will start the draft.' }]
    return [
      { id: id('m'), from: 'scrapal', text: 'Here is where your application stands. Everything is yours to copy straight into the university’s portal.' },
      { id: id('m'), from: 'scrapal', card: { kind: 'application', courseId } },
      { id: id('m'), from: 'scrapal', text: 'And this is the statement as it stands. Everything in brackets is still yours to write.' },
      { id: id('m'), from: 'scrapal', card: { kind: 'statement', courseId } },
      {
        id: id('m'),
        from: 'scrapal',
        text: 'Open the pack to tick off documents and finish the statement. I have left every gap marked — do not let anyone fill them with things you have not done.',
        chips: [
          { label: 'Tick off my documents', value: 'my documents' },
          { label: 'Start another application', value: 'apply' },
          { label: 'Check something I was told', value: 'claim' },
        ],
      },
    ]
  }

  if (state.step === 'documents') {
    if (!state.applyingTo) {
      return [{ id: id('m'), from: 'scrapal', text: 'Pick an application first and I will list what it needs.' }]
    }
    return [
      { id: id('m'), from: 'scrapal', text: 'These are what that university asks for. Tick what you already have — I will keep count.' },
      { id: id('m'), from: 'scrapal', card: { kind: 'documents', courseId: state.applyingTo } },
      {
        id: id('m'),
        from: 'scrapal',
        text: 'Tell me when you have sent it and I will keep track of where it stands.',
        chips: [
          { label: 'I have sent this application', value: 'submitted' },
          { label: 'Back to my draft', value: 'pack' },
        ],
      },
    ]
  }

  if (state.step === 'research') {
    const wanted = state.researchFocus === 'funding' ? 'funding' : 'researchers'
    return [{
      id: id('m'),
      from: 'scrapal',
      text: `Paste a few sentences about your research — an abstract, a proposal, or just what you `
        + `work on. I read it here on your device, pull out the topics, and show you those topics `
        + `before anything is searched. Then I will find ${wanted} that match.`,
      chips: [{ label: 'Not now', value: 'back to', tone: 'skip' }],
    }]
  }

  if (state.step === 'radarTerms') {
    const research = state.research
    if (!research) return [{ id: id('m'), from: 'scrapal', text: 'Tell me about your research first.' }]
    return [
      {
        id: id('m'),
        from: 'scrapal',
        text: 'This is everything that would leave your device. Your sentences stay here.',
      },
      {
        id: id('m'),
        from: 'scrapal',
        card: { kind: 'radar-terms', terms: research.terms, discipline: research.discipline },
      },
      {
        id: id('m'),
        from: 'scrapal',
        text: 'Shall I search on those?',
        chips: [
          { label: 'Yes, search', value: 'search my research' },
          { label: 'Find funding instead', value: 'funding for my research' },
          { label: 'Let me rewrite it', value: 'my research is' },
        ],
      },
    ]
  }

  if (state.step === 'drafts') {
    return [
      { id: id('m'), from: 'scrapal', text: 'Here is what you have on the go. Pick one up wherever you left it.' },
      { id: id('m'), from: 'scrapal', card: { kind: 'drafts' } },
    ]
  }

  if (state.step === 'open') {
    return [{
      id: id('m'),
      from: 'scrapal',
      text: 'Ask me anything about the courses I have read — fees, entry requirements, intakes. I answer from published pages and say so when I cannot.',
    }]
  }

  const step = stepById(state.step)
  if (!step) return []
  const chips = step.chips?.({ ...context, state })
  return [{ id: id('m'), from: 'scrapal', text: step.ask({ ...context, state }), chips }]
}

/** An aside: answer the question, then offer the way back. */
function aside(state: PlannerState, question: string): Message[] {
  const back = state.resumeStack[state.resumeStack.length - 1]
  const label = back ? STEP_LABELS[back] : undefined
  return [
    { id: id('m'), from: 'scrapal', card: { kind: 'answer', question } },
    ...(label ? [{
      id: id('m'),
      from: 'scrapal' as const,
      text: `Shall we pick up ${label}?`,
      chips: [
        { label: `Back to ${label}` , value: 'resume' },
        { label: 'Ask something else', value: 'another question' },
      ],
    }] : []),
  ]
}

/** Opens the conversation. Scrapal speaks first — a blank chat box asks the
    student to already know what to ask, which is the whole problem. */
export function start(context: StepContext): PlannerState {
  const state = context.state
  return { ...state, messages: speak(state, context) }
}

/** Picks a saved conversation back up. Says what it remembers, rather than
    pretending the last session did not happen or repeating it. */
export function resume(saved: PlannerState, since: string, context: StepContext): PlannerState {
  const application = saved.applyingTo ? readApplication(saved.applyingTo) : undefined
  const course = context.courses.find((item) => item.id === saved.applyingTo)
  // Everything on the go, not only the one the thread stopped on. A student who
  // left three drafts open should be asked about three, not one.
  const drafts = listApplications().filter((item) => item.status === 'draft')
  const others = drafts.filter((item) => item.courseId !== saved.applyingTo)

  const where = application && course
    ? `You were partway through your application to ${course.institution.name}.`
      + (others.length ? ` ${others.length} other draft${others.length === 1 ? ' is' : 's are'} open too.` : '')
    : drafts.length
      ? `You have ${drafts.length} draft application${drafts.length === 1 ? '' : 's'} open.`
      : saved.done.length > 2
        ? 'We had made a start on your plan.'
        : null

  const chips: Chip[] = application && course
    ? [
      { label: `Carry on with ${course.institution.name}`, value: `resume:${course.id}` },
      ...(others.length ? [{ label: 'Show my other drafts', value: 'my applications' }] : []),
      { label: 'Start something new', value: 'restart' },
    ]
    : drafts.length
      ? [
        { label: 'Pick up a draft', value: 'my applications' },
        { label: 'Find something new', value: 'show me courses' },
      ]
      : [
        { label: 'Carry on', value: 'show me courses' },
        { label: 'Start again', value: 'restart' },
      ]

  // Every visit added another greeting to the saved thread, so a returning
  // student met a wall of them. There is only ever one, and it is the last thing
  // said.
  const withoutOldGreetings = saved.messages.filter((message) => message.kind !== 'resume')

  // A bubble renders either speech or a card, never both, so the greeting and
  // the draft list have to be two messages — putting a card on the greeting
  // silently threw the greeting away. Both carry kind 'resume' so the next
  // visit clears both; tagging only the greeting would leave a draft list
  // stacking up on every reload.
  const greeting: Message = {
    id: id('m'),
    from: 'scrapal',
    kind: 'resume',
    text: `Welcome back. We last spoke ${since}.${where ? ` ${where}` : ''}`,
    chips,
  }
  // With drafts open the list itself is the answer to "where was I", so it
  // comes with the greeting rather than one tap behind it.
  const list: Message[] = drafts.length
    ? [{ id: id('m'), from: 'scrapal', kind: 'resume', card: { kind: 'drafts' } }]
    : []

  return { ...saved, messages: [...withoutOldGreetings, greeting, ...list] }
}

function advance(state: PlannerState, context: StepContext, nextStep: PlannerState['step']): PlannerState {
  const moved: PlannerState = { ...state, step: nextStep, done: [...state.done, state.step] }
  return { ...moved, messages: [...moved.messages, ...speak(moved, { ...context, state: moved })] }
}

/** The student said something. `display` is what they see themselves having
    said — tapping a chip should echo "Master's", not the "postgraduate" the
    parser needs. Returns the conversation after it. */
export function answer(
  state: PlannerState,
  text: string,
  context: StepContext,
  display?: string,
): PlannerState {
  const said: Message = { id: id('m'), from: 'student', text: display ?? text }
  const withSaid: PlannerState = { ...state, messages: [...state.messages, said] }
  const ctx = { ...context, state: withSaid }
  const lower = text.trim().toLowerCase()

  // Shortcuts the student can take at any point. Matched on phrases rather than
  // exact strings, because someone typing rather than tapping will not produce
  // the chip's value verbatim.
  const says = (...phrases: string[]) => phrases.some((phrase) => lower.includes(phrase))
  const browsing = says('show me course', 'show me some course', 'just show', 'browse')
  // These only make sense once there is something on screen to act on, so they
  // cannot swallow an answer to an earlier question.
  const afterResults = state.done.includes('intake') || state.step === 'results' || state.step === 'costs' || state.step === 'open'

  if (says('restart', 'start again', 'start over')) {
    const reset: PlannerState = { ...withSaid, step: 'subject', done: [] }
    return { ...reset, messages: [...reset.messages, ...speak(reset, { ...ctx, state: reset })] }
  }
  if (browsing) return advance(withSaid, ctx, 'results')

  // Coming back from an aside.
  if (lower === 'resume' || says('back to')) {
    const back = withSaid.resumeStack[withSaid.resumeStack.length - 1]
    if (back) {
      const resumed: PlannerState = { ...withSaid, resumeStack: withSaid.resumeStack.slice(0, -1), step: back }
      return { ...resumed, messages: [...resumed.messages, ...speak(resumed, { ...ctx, state: resumed })] }
    }
  }

  // Where an application has got to.
  if (withSaid.applyingTo) {
    const status = says('i have sent', 'have sent this', 'submitted', 'i applied', 'sent it')
      ? 'submitted' as const
      : says('got an offer', 'received an offer', 'they made me an offer', 'offer received')
        ? 'offer' as const
        : says('was rejected', 'unsuccessful', 'turned me down', 'said no')
          ? 'unsuccessful' as const
          : null
    if (status) {
      setStatus(withSaid.applyingTo, status)
      const words = {
        submitted: 'Noted — marked as sent. Tell me when you hear back.',
        offer: 'That is good news. Marked as an offer.',
        unsuccessful: 'Marked as unsuccessful. It happens to strong applicants too — shall we look at the others on your list?',
      }
      return {
        ...withSaid,
        messages: [...withSaid.messages, { id: id('m'), from: 'scrapal', text: words[status] }],
      }
    }
  }

  // The Radar, asked for in the student's own words.
  const wantsPeople = says('find researcher', 'find me researcher', 'who works on', 'find a supervisor',
    'find supervisor', 'potential supervisor', 'who could supervise', 'research radar', 'people like me')
  const wantsMoney = says('funding for my research', 'research funding', 'find me funding',
    'funded phd', 'studentship', 'grants for', 'fellowship')
  if (wantsPeople || wantsMoney) {
    const focus = wantsMoney ? 'funding' as const : 'people' as const
    const remembered = withSaid.research ?? loadTerms()
    // Already know what they work on: no reason to ask again.
    if (remembered && 'terms' in remembered && remembered.terms.length) {
      const ready: PlannerState = {
        ...withSaid,
        research: { terms: remembered.terms, discipline: remembered.discipline },
        researchFocus: focus,
      }
      return {
        ...ready,
        messages: [...ready.messages,
          {
            id: id('m'),
            from: 'scrapal',
            text: `Using the ${remembered.terms.length} terms you agreed last time.`,
          },
          {
            id: id('m'),
            from: 'scrapal',
            card: { kind: 'radar-matches', terms: remembered.terms, discipline: remembered.discipline, focus },
          },
          {
            id: id('m'),
            from: 'scrapal',
            text: focus === 'funding'
              ? 'Deadlines move, so check the funder\u2019s own page before you plan around one.'
              : 'Open a profile to see whether they are supervising, and what they have published.',
            chips: [
              { label: focus === 'funding' ? 'Show me researchers too' : 'And the funding', value: focus === 'funding' ? 'find researchers' : 'funding for my research' },
              { label: 'Use different research', value: 'my research is' },
            ],
          },
        ],
      }
    }
    const asking: PlannerState = { ...withSaid, researchFocus: focus, step: 'research' }
    return { ...asking, messages: [...asking.messages, ...speak(asking, { ...ctx, state: asking })] }
  }

  // Starting over with a different piece of work.
  if (says('my research is', 'different research', 'rewrite it')) {
    const asking: PlannerState = { ...withSaid, research: null, step: 'research' }
    return { ...asking, messages: [...asking.messages, ...speak(asking, { ...ctx, state: asking })] }
  }

  // The confirmation, once the terms have been shown.
  if (says('search my research') && withSaid.research) {
    const focus = withSaid.researchFocus
    saveTerms(withSaid.research.terms, withSaid.research.discipline)
    return {
      ...withSaid,
      step: 'open',
      messages: [...withSaid.messages,
        {
          id: id('m'),
          from: 'scrapal',
          card: { kind: 'radar-matches', terms: withSaid.research.terms, discipline: withSaid.research.discipline, focus },
        },
        {
          id: id('m'),
          from: 'scrapal',
          text: 'Anything here worth chasing?',
          chips: [
            { label: focus === 'funding' ? 'Show me researchers too' : 'And the funding', value: focus === 'funding' ? 'find researchers' : 'funding for my research' },
            { label: 'Back to my courses', value: 'show me courses' },
          ],
        },
      ],
    }
  }

  // Whatever they paste while being asked about their work is the work itself.
  if (withSaid.step === 'research') {
    const print = fingerprint(text)
    if (isEmpty(print)) {
      return {
        ...withSaid,
        messages: [...withSaid.messages, {
          id: id('m'),
          from: 'scrapal',
          text: 'I could not pick out anything I recognise there. Name the methods you use and the '
            + 'problem you are working on — I will not guess, because a guess would send the wrong '
            + 'terms out on your behalf.',
          chips: [{ label: 'Not now', value: 'back to', tone: 'skip' }],
        }],
      }
    }
    const read: PlannerState = {
      ...withSaid,
      research: { terms: print.keywords, discipline: print.discipline },
      step: 'radarTerms',
    }
    return { ...read, messages: [...read.messages, ...speak(read, { ...ctx, state: read })] }
  }

  if (says('my documents', 'what do i need', 'what documents', 'tick off')) {
    return advance(withSaid, ctx, 'documents')
  }

  // Picking a draft back up, days later.
  if (says('my draft', 'my application', 'my applications', 'continue', 'where was i', 'pick up')) {
    return advance(withSaid, ctx, 'drafts')
  }
  if (lower.startsWith('resume:')) {
    const courseId = text.trim().slice('resume:'.length)
    const resumed: PlannerState = { ...withSaid, applyingTo: courseId, step: nextUnanswered(courseId) }
    return { ...resumed, messages: [...resumed.messages, ...speak(resumed, { ...ctx, state: resumed })] }
  }

  // A question at any point. The place in the flow is kept, not lost.
  if (looksLikeAQuestion(text) && withSaid.step !== 'asking' && withSaid.step !== 'open') {
    const asked: PlannerState = {
      ...withSaid,
      resumeStack: [...withSaid.resumeStack, withSaid.step],
      step: 'asking',
    }
    return { ...asked, messages: [...asked.messages, ...aside(asked, text)] }
  }
  if (withSaid.step === 'asking') {
    if (says('another question', 'something else')) {
      return {
        ...withSaid,
        messages: [...withSaid.messages, {
          id: id('m'), from: 'scrapal', text: 'Go ahead — ask away.',
        }],
      }
    }
    return { ...withSaid, messages: [...withSaid.messages, ...aside(withSaid, text)] }
  }

  // Choosing which course to apply to.
  if (lower.startsWith('apply:')) {
    const courseId = text.trim().slice('apply:'.length)
    startApplication(courseId)
    const picked: PlannerState = { ...withSaid, applyingTo: courseId }
    return advance(picked, { ...ctx, state: picked }, 'details')
  }
  if (afterResults && says('apply', 'application', 'get it ready', 'ready to send')) {
    return advance(withSaid, ctx, 'apply')
  }
  if (afterResults && says('cost', 'price', 'afford')) return advance(withSaid, ctx, 'costs')
  if (afterResults && says('ask', 'claim', 'question', 'told me')) return advance(withSaid, ctx, 'open')

  const step = stepById(withSaid.step)
  if (!step) return withSaid

  if (!step.apply) return advance(withSaid, ctx, step.next)

  const patch = step.apply(text, ctx)
  if (patch === null) {
    // Not understood. Say so plainly and stay put rather than guessing.
    return {
      ...withSaid,
      messages: [...withSaid.messages, {
        id: id('m'),
        from: 'scrapal',
        text: 'I did not follow that. You can tap one of the options, or say “skip”.',
        chips: step.chips?.(ctx),
      }],
    }
  }

  const nextState: PlannerState = {
    ...withSaid,
    subject: 'subject' in patch ? patch.subject ?? null : withSaid.subject,
    profile: applyToProfile(withSaid.profile, patch),
    answers: patch.answer
      ? { ...withSaid.answers, [patch.answer.id]: patch.answer.text }
      : withSaid.answers,
  }
  // Statement answers and the referee belong to the application, not just the
  // conversation.
  if (patch.answer && withSaid.applyingTo) {
    setAnswer(withSaid.applyingTo, patch.answer.id, patch.answer.text)
  }
  if ('referee' in patch && withSaid.applyingTo && patch.referee) {
    setReferee(withSaid.applyingTo, patch.referee)
  }
  const acknowledged = acknowledgement(step.id, patch, isSkip(text))
  const withAck: PlannerState = acknowledged
    ? { ...nextState, messages: [...nextState.messages, { id: id('m'), from: 'scrapal', text: acknowledged }] }
    : nextState
  return advance(withAck, { ...ctx, state: withAck }, step.next)
}

/** A short human acknowledgement, so the student is answering a person rather
    than filling a form one field at a time. */
function acknowledgement(step: string, patch: Partial<StepResult>, skipped: boolean): string | null {
  if (skipped) return 'No problem, we can come back to that.'
  if (step === 'grades' && patch.classification) return 'Got it.'
  if (step === 'english' && patch.ieltsOverall != null && patch.ieltsOverall < 6) {
    return 'Noted. That rules a few things out, but not as many as people expect.'
  }
  if (step === 'budget' && patch.budget != null) return 'Right — I will keep everything inside that.'
  return null
}

export function chipsFor(state: PlannerState): Chip[] {
  const last = [...state.messages].reverse().find((message) => message.chips?.length)
  return last?.chips ?? []
}

/** Where an application left off: the first statement question not yet answered. */
function nextUnanswered(courseId: string): PlannerState['step'] {
  const application = readApplication(courseId)
  const answers = application?.answers ?? {}
  if (!application?.referee) return 'referee'
  if (!answers.why) return 'why'
  if (!answers.experience) return 'experience'
  if (!answers.goal) return 'goal'
  return 'pack'
}
