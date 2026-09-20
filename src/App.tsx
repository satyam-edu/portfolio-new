import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import GrassSkyScene, { PAN_DURATION, type CameraView } from './GrassSkyScene'

const LOAD_MS = 900

function App() {
  const [progress, setProgress] = useState(0)
  const [entered, setEntered] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const taglineRef = useRef<HTMLDivElement>(null)
  const uiRef = useRef<HTMLDivElement>(null)
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
    tl.to([heroRef.current, taglineRef.current], { y: '-100vh', ...pan }, 0)
    tl.to(cameraView.current, { shift: 0, clouds: 1, ...pan }, 0)
    if (uiRef.current) {
      const settle = PAN_DURATION * 0.8
      tl.set(uiRef.current, { opacity: 1 }, settle)
      tl.fromTo(
        uiRef.current.children,
        { opacity: 0 },
        { opacity: 1, duration: 1, stagger: 0.1, ease: 'power2.out' },
        settle,
      )
    }
  }

  return (
    <main className="relative h-full w-full overflow-hidden rounded-r-2xl border-2 border-l-0 border-white bg-white md:rounded-r-[20px]">
      <div className="absolute inset-y-0 left-11 right-0 overflow-hidden rounded-l-2xl">
        <GrassSkyScene view={cameraView.current} />
      </div>

      <div ref={uiRef} className="pointer-events-none absolute inset-0 z-10 opacity-0">
        <div
          className={`absolute top-6 right-6 flex gap-1.5 rounded-2xl border border-white/60 bg-white/70 p-1.5 shadow-sm backdrop-blur-md ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          {['Ig', 'Tw', 'Ln', 'Mail'].map((label) => (
            <span
              key={label}
              className="cursor-pointer rounded-lg border border-black/5 bg-white px-3 py-1.5 font-sans text-xs font-medium text-neutral-800 shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
            >
              {label}
            </span>
          ))}
        </div>

        <nav
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

      <div ref={heroRef} className={`absolute inset-0 ${entered ? 'pointer-events-none' : ''}`}>
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
                className="cursor-pointer"
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
                className="cursor-pointer font-sans"
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
        className="pointer-events-none absolute right-8 bottom-6 z-20 flex flex-col items-start text-left text-3xl text-white/95 uppercase md:right-12 md:text-4xl"
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
