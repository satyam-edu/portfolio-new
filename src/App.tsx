import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import GrassSkyScene, { PAN_DURATION, type CameraView } from './GrassSkyScene'

const LOAD_MS = 900
const RAIL_W = 44
const BUTTERFLY_COLORS = ['#e63946', '#ff7b00', '#ffd166', '#80ed99', '#06d6a0', '#00b4d8', '#4361ee', '#b5179e', '#ff5d8f', '#f8f9fa']
const CLIP_FULL = 'inset(0px 0px 0px 0px round 0px 0px 0px 0px)'
const CLIP_RAIL = `inset(0px 0px 0px ${RAIL_W}px round 20px 0px 0px 20px)`

function App() {
  const [progress, setProgress] = useState(0)
  const [entered, setEntered] = useState(false)
  const taglineRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [butterflyIdx, setButterflyIdx] = useState(0)
  const desktopRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const cameraView = useRef<CameraView>({ shift: 1, clouds: 0 })

  useEffect(() => {
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const pct = Math.min(100, Math.round(((now - start) / LOAD_MS) * 100))
      setProgress(pct)
      if (pct < 100) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleEnter = () => {
    if (progress < 100 || entered) return
    setEntered(true)

    // One timeline, one start time, one ease: the overlay slides up 100vh while the camera pitches down by
    // exactly the angle that moves the horizon 100vh, so both read as a single physical camera pan.
    const tl = gsap.timeline()
    const pan = { duration: PAN_DURATION, ease: 'power4.inOut' }
    tl.to(heroRef.current, { y: '-100vh', ...pan }, 0)
    // tagline fades out with the landing prompts, then back in over the settled grass
    tl.to(taglineRef.current, { opacity: 0, duration: 0.4, ease: 'power2.out' }, 0)
    tl.to(taglineRef.current, { opacity: 1, duration: 0.8, ease: 'power2.out' }, PAN_DURATION)
    tl.to(cameraView.current, { shift: 0, clouds: 1, ...pan }, 0)
    // Last 0.8s of the pan: the rail slides in, the scene insets beside it, and the top widget slides down.
    const settle = PAN_DURATION - 0.8
    const enter = { duration: 0.8, ease: 'power2.out' }
    tl.to(navRef.current, { x: 0, opacity: 1, ...enter }, settle)
    tl.to(sceneRef.current, { clipPath: CLIP_RAIL, ...enter }, settle)
    tl.to(desktopRef.current, { opacity: 1, ...enter }, settle)
    tl.to(topRef.current, { y: 0, opacity: 1, ...enter }, settle)
  }

  useEffect(() => {
    if (progress < 100 || entered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleEnter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, entered])

  return (
    <main className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-white bg-white md:rounded-[20px]">
      <div ref={sceneRef} className="absolute inset-0" style={{ clipPath: CLIP_FULL }}>
        <GrassSkyScene view={cameraView.current} butterflyColor={BUTTERFLY_COLORS[butterflyIdx]} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <div
          ref={topRef}
          style={{ transform: 'translateY(-100%)', opacity: 0 }}
          className={`c-window c-window--contact ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          <div className="c-window__header">
            <div className="c-window__header__left">
              <div className="c-window__header__title">Null address</div>
            </div>
            <div className="c-window__header__dots">
              <div className="c-window__header__dots__dot first" />
              <div className="c-window__header__dots__dot" />
            </div>
          </div>
          <div className="c-window__inner">
            <div className="c-window__content">
              <div className="c-window__divider" />
              <div className="c-window__links">
                {[
                  { label: 'Ln', href: 'https://www.linkedin.com/in/satyam-in/' },
                  { label: 'X', href: 'https://x.com/x__satyam' },
                  { label: 'Mail', href: 'mailto:satyamsharma.main@gmail.com' },
                  { label: 'Cd', href: 'https://codolio.com/profile/Satyam_edu' },
                ].map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="c-button c-button--main"
                  >
                    <span>{label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={desktopRef}
          style={{ opacity: 0 }}
          className={`absolute bottom-6 left-16 ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          <button
            onClick={() => setButterflyIdx((i) => (i + 1) % BUTTERFLY_COLORS.length)}
            className="flex cursor-pointer flex-col items-center gap-2 transition-transform duration-150 active:scale-[0.92]"
          >
            <div className="relative flex h-14 w-12 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg bg-gradient-to-b from-white to-[#f6e9d8] shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
              <span className="absolute top-0 right-0 h-3.5 w-3.5 rounded-bl-md bg-white shadow-[-1px_1px_1px_rgba(0,0,0,0.08)]" />
              <span className="mt-1 flex items-end gap-1">
                <i className="h-3 w-3 rounded-full bg-[#ff7b4a]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#d62828]" />
              </span>
              <i className="h-2 w-2 rounded-full bg-[#ffb703]" />
            </div>
            <span className="rounded-full bg-[#3d4a2a]/80 px-3 py-0.5 font-sans text-[11px] font-bold text-white backdrop-blur-sm">
              Butterflies
            </span>
          </button>
        </div>

        <nav
          ref={navRef}
          style={{ transform: 'translateX(-100%)', opacity: 0 }}
          className={`absolute inset-y-0 left-0 flex w-11 flex-col items-center bg-white py-3 ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          <svg className="h-8 w-8 shrink-0 text-white" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="16" fill="#111" />
            <circle cx="11.5" cy="13" r="1.6" fill="currentColor" />
            <circle cx="20.5" cy="13" r="1.6" fill="currentColor" />
            <path d="M10.5 19c1.4 2 3.4 3 5.5 3s4.1-1 5.5-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className="mt-auto mb-6 flex flex-col items-center gap-5">
            {['Skills', 'Work', 'Contact'].map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-5">
                {i > 0 && <span className="h-px w-4 bg-black/15" />}
                <a
                  href={`#${label.toLowerCase()}`}
                  className="font-sans text-xs font-semibold tracking-[0.15em] text-neutral-900 uppercase transition-opacity [writing-mode:vertical-rl] hover:opacity-50"
                >
                  {label}
                </a>
              </div>
            ))}
          </div>
          <svg
            className="h-5 w-5 shrink-0 cursor-pointer text-neutral-900 transition-opacity hover:opacity-50"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M5 10v4M9 6v12M13 9v6M17 4v16M21 11v2" />
          </svg>
        </nav>
      </div>

      <div ref={heroRef} className={`absolute inset-0 z-20 ${entered ? 'pointer-events-none' : ''}`}>
        <div
          className="absolute bottom-6 left-12 md:left-28"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
        >
          <div style={{ display: 'grid', justifyItems: 'center', alignItems: 'end' }}>
            <span
              className="text-white transition-opacity duration-300"
              style={{
                gridArea: '1 / 1',
                fontFamily: "'Instrument Serif', serif",
                fontWeight: 400,
                fontSynthesis: 'none',
                fontSize: '32px',
                lineHeight: 0.85,
                opacity: progress < 100 ? 1 : 0,
                pointerEvents: progress < 100 ? 'auto' : 'none',
              }}
            >
              {progress}%
            </span>

            <div
              className="transition-opacity delay-300 duration-300"
              style={{
                gridArea: '1 / 1',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '9px',
                color: 'white',
                opacity: progress >= 100 ? 1 : 0,
                pointerEvents: progress >= 100 ? 'auto' : 'none',
              }}
            >
              <span
                onClick={handleEnter}
                className="cursor-pointer transition-opacity hover:opacity-60"
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontWeight: 200,
                  fontSynthesis: 'none',
                  fontSize: '30px',
                  lineHeight: 0.85,
                  paddingBottom: '3px',
                  borderBottom: '1px solid white',
                }}
              >
                ENTER
              </span>
              <span
                aria-hidden
                style={{
                  alignSelf: 'center',
                  width: '1px',
                  height: '26px',
                  background: 'white',
                  transform: 'rotate(14deg)',
                }}
              />
              <span
                onClick={handleEnter}
                className="cursor-pointer font-sans transition-opacity hover:opacity-60"
                style={{ fontSize: '12px', fontWeight: 400, lineHeight: 1.05, textAlign: 'center' }}
              >
                Enter site
                <br />
                <span style={{ display: 'inline-block', paddingBottom: '1px', borderBottom: '1px solid white' }}>
                  without audio
                </span>
              </span>
            </div>
          </div>

          <span
            className="font-sans text-white uppercase"
            style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1, letterSpacing: '0', marginTop: '38px' }}
          >
            By continuing to browse this site
            <br />
            you agree to the use of cookies for analytics.
          </span>
        </div>
      </div>

      <div
        ref={taglineRef}
        className="pointer-events-none absolute right-8 bottom-8 z-20 flex flex-col items-start text-left text-3xl text-white/95 uppercase md:text-4xl"
        style={{
          fontFamily: "'Instrument Serif', serif",
          fontWeight: 400,
          fontSynthesis: 'none',
          lineHeight: 0.88,
          letterSpacing: '-0.04em',
        }}
      >
        <span>SOFTWARE</span>
        <span style={{ marginLeft: '1.1em' }}>DEVELOPER.</span>
        <span style={{ marginLeft: '2.2em' }}>CRAFTING THE</span>
        <div className="flex items-end" style={{ marginLeft: '0.9em', gap: '0.6em' }}>
          <span>MODERN WEB.</span>
          <span
            className="font-sans text-[9px] font-bold text-white/90"
            style={{ letterSpacing: '0.1em', lineHeight: 1.3 }}
          >
            &copy;2026
            <br />
            SATYAM
          </span>
        </div>
      </div>
    </main>
  )
}

export default App
