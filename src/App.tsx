import { useEffect, useState } from 'react'
import GradientGrainCanvas from './GradientGrainCanvas'

const LOAD_MS = 2200

function App() {
  const [progress, setProgress] = useState(0)

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

  return (
    <main className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-white md:rounded-[20px]">
      <GradientGrainCanvas />

      <div
        className="absolute right-8 bottom-6 flex flex-col items-start text-left text-3xl text-white/95 uppercase md:right-12 md:text-4xl"
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
          <span>MODERN WEB</span>
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
    </main>
  )
}

export default App
