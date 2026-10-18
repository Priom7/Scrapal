import { Composition } from 'remotion'
import { AdminFilm, type AdminFilmProps } from './admin/AdminFilm'
import { ADMIN_TIMELINE } from './admin/film'
import { Promo, type PromoProps } from './Promo'
import { FPS, HEIGHT, TOTAL, WIDTH } from './timeline'
import './fonts'

// Change the end card without touching code:
//   npx remotion render ScrapalPromo out/scrapal-promo.mp4 --props='{"cta":"Join the beta","url":"example.com"}'
const DEFAULTS: PromoProps = { cta: 'Start planning', url: '' }
const ADMIN_DEFAULTS: AdminFilmProps = { cta: 'Request a demo', url: '' }

export function RemotionRoot() {
  return <>
    <Composition
      id="ScrapalPromo"
      component={Promo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={DEFAULTS}
    />
    {/* The operator console film: npx remotion render ScrapalAdmin out/scrapal-admin.mp4 */}
    <Composition
      id="ScrapalAdmin"
      component={AdminFilm}
      durationInFrames={ADMIN_TIMELINE.TOTAL}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={ADMIN_DEFAULTS}
    />
  </>
}
