// The operator film's clock and voice. Scenes import from here, never from
// the student film's ../timeline or ../vo exports.
import { createTimeline } from '../timeline'
import { createVoice } from '../vo'
import timeline from './timeline.json'
import durations from './vo/durations.json'
import script from './vo/script.json'

export const ADMIN_TIMELINE = createTimeline(timeline)
export const ADMIN_VOICE = createVoice({ script, durations, timeline: ADMIN_TIMELINE, audio: 'audio/vo-admin' })
export const { vo, voEnd } = ADMIN_VOICE
export const scene = ADMIN_TIMELINE.scene
