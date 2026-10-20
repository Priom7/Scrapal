// Render settings tuned for an M1 MacBook Air with 8 GB of memory.
//
// Two browser tabs render frames in parallel: enough to keep both performance
// cores busy without pushing the machine into swap, which is what actually
// makes a render slow on 8 GB. Raise it on a bigger machine.
import { Config } from '@remotion/cli/config'

Config.setConcurrency(2)
Config.setOverwriteOutput(true)

// `npm run render:audio` re-mixes the soundtrack without re-rendering a single
// frame; video settings are refused on an audio-only render, so skip them.
const audioOnly = process.env.SCRAPAL_AUDIO_ONLY === '1'
if (!audioOnly) {
  Config.setVideoImageFormat('jpeg')
  // UI text and thin brand strokes show JPEG ringing below ~92.
  Config.setJpegQuality(96)
  Config.setCodec('h264')
  // CRF 16 with the slow preset is visually lossless for flat UI colour and
  // gradients, at a file size that still uploads anywhere.
  Config.setCrf(16)
  Config.setX264Preset('slow')
  // Tag and convert as BT.709 so brand blue renders the same on every player.
  Config.setColorSpace('bt709')
  Config.setAudioBitrate('320k')
}
