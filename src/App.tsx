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
    <main className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-white md:rounded-[20px]">
      <GrassSkyScene view={cameraView.current} />

      <div ref={uiRef} className="pointer-events-none absolute inset-0 z-10 opacity-0">
        <svg
          className="absolute top-6 left-6 h-8 w-8 text-white"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="16" cy="16" r="14" />
          <circle cx="11.5" cy="13" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="20.5" cy="13" r="1.4" fill="currentColor" stroke="none" />
          <path d="M10.5 19c1.4 2 3.4 3 5.5 3s4.1-1 5.5-3" />
        </svg>

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

        <div className="absolute top-1/2 left-3">
          <div
            className={`flex items-center gap-8 font-sans text-[10px] tracking-[0.25em] whitespace-nowrap text-white/80 uppercase ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{ transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left top' }}
          >
            <span className="cursor-pointer">Contact</span>
            <span className="cursor-pointer">Projects</span>
            <span className="cursor-pointer">About</span>
          </div>
        </div>

        <div
          className={`absolute bottom-8 left-12 flex gap-6 ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          {[
            {
              label: 'UniTrack & Dev',
              icon: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
            },
            {
              label: 'UI/UX & Graphics',
              icon: (
                <>
                  <rect x="4" y="4" width="10" height="10" rx="1.5" />
                  <rect x="10" y="10" width="10" height="10" rx="1.5" />
                </>
              ),
            },
            {
              label: 'GitHub',
              icon: (
                <path
                  fill="currentColor"
                  stroke="none"
                  d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.84c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0022 12c0-5.52-4.48-10-10-10z"
                />
              ),
            },
          ].map(({ label, icon }) => (
            <div key={label} className="flex w-20 cursor-pointer flex-col items-center gap-2">
              <div className="relative flex h-14 w-12 items-center justify-center rounded-[6px] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
                <span className="absolute top-0 right-0 h-3 w-3 rounded-bl-[4px] bg-neutral-200" />
                <svg
                  className="h-6 w-6 text-neutral-900"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {icon}
                </svg>
              </div>
              <span className="text-center font-sans text-[11px] leading-tight font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {label}
              </span>
            </div>
          ))}
        </div>
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
