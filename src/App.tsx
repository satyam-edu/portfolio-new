import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import GrassSkyScene, { PAN_DURATION, type CameraView } from './GrassSkyScene'

const LOAD_MS = 900
const RAIL_W = 44
const BUTTERFLY_COLORS = ['#e63946', '#ff7b00', '#ffd166', '#80ed99', '#06d6a0', '#00b4d8', '#4361ee', '#b5179e', '#ff5d8f', '#f8f9fa']
// expanded panel width in px, mirrors the CSS clamp on the sidebar
const drawerW = () => Math.min(520, Math.max(440, window.innerWidth * 0.37))

function App() {
  const [progress, setProgress] = useState(0)
  const [entered, setEntered] = useState(false)
  const taglineRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [butterflyIdx, setButterflyIdx] = useState(0)
  const desktopRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const cameraView = useRef<CameraView>({ shift: 1, clouds: 0, throttled: false })

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
    const w = drawerW()
    tl.fromTo(navRef.current, { x: -(w + RAIL_W), opacity: 0 }, { x: -w, opacity: 1, ...enter }, settle)
    tl.to(desktopRef.current, { opacity: 1, ...enter }, settle)
    tl.to(topRef.current, { y: 0, opacity: 1, ...enter }, settle)
  }

  // park the sidebar fully off-screen and invisible for the landing page (before first paint)
  useLayoutEffect(() => {
    gsap.set(navRef.current, { x: -(drawerW() + RAIL_W), opacity: 0 })
    gsap.set(drawerRef.current?.querySelectorAll('.drawer-card-item') ?? [], { opacity: 0, y: 24 })
  }, [])

  // keep the resting positions right if the viewport resizes (drawer width is viewport-relative)
  useEffect(() => {
    if (!entered) return
    const onResize = () => {
      const w = drawerW()
      gsap.set(navRef.current, { x: isContactOpen ? 0 : -w })
      gsap.set([sceneRef.current, desktopRef.current], { x: isContactOpen ? w : 0 })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [entered, isContactOpen])

  // Compositor-only: the fixed-width sidebar, the scene and the desktop icons all translate by the same amount,
  // so opening never triggers layout and the WebGL canvas never resizes.
  useEffect(() => {
    if (!entered) return
    const w = drawerW()
    const items = drawerRef.current?.querySelectorAll('.drawer-card-item') ?? []
    const slideDur = 1.15
    const to = { duration: slideDur, ease: 'power3.inOut', overwrite: 'auto', force3D: true } as const
    const slide = (at: number) => {
      tl.to(navRef.current, { x: isContactOpen ? 0 : -w, ...to }, at)
      tl.to(sceneRef.current, { x: isContactOpen ? w : 0, ...to }, at)
      tl.to(desktopRef.current, { x: isContactOpen ? w : 0, ...to }, at)
    }
    tlRef.current?.kill()
    const tl = (tlRef.current = gsap.timeline())
    // halve WebGL's frame rate while the panel travels; restore when the slide tweens end
    const freezeAt = isContactOpen ? 0 : 0.15
    tl.call(() => (cameraView.current.throttled = true), [], freezeAt)
    tl.call(() => (cameraView.current.throttled = false), [], freezeAt + slideDur)
    if (isContactOpen) {
      // cards cascade top-to-bottom as the panel settles, so no card paints during the fast part of the slide
      slide(0)
      tl.to(items, { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out', overwrite: 'auto' }, 1.0)
    } else {
      // content is gone before the panel starts collapsing
      tl.to(items, { opacity: 0, y: 24, duration: 0.15, ease: 'power2.in', overwrite: 'auto' }, 0)
      slide(0.15)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContactOpen])

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
      <div ref={sceneRef} className="absolute inset-0 will-change-transform">
        <GrassSkyScene view={cameraView.current} butterflyColor={BUTTERFLY_COLORS[butterflyIdx]} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        {isContactOpen && <div className="pointer-events-auto absolute inset-0 z-10" onClick={() => setIsContactOpen(false)} />}

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
          className={`absolute bottom-6 left-16 will-change-transform ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
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

        <div
          ref={navRef}
          className={`absolute inset-y-0 left-0 z-20 w-[calc(clamp(440px,37vw,520px)+44px)] bg-white will-change-transform ${entered ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          <aside
            ref={drawerRef}
            aria-hidden={!isContactOpen}
            inert={!isContactOpen}
          onScroll={(e) => {
            const el = e.currentTarget
            const max = el.scrollHeight - el.clientHeight
            const track = trackRef.current
            const thumb = thumbRef.current
            if (track && thumb) thumb.style.transform = `translateY(${max > 0 ? (el.scrollTop / max) * (track.clientHeight - thumb.offsetHeight) : 0}px)`
          }}
            className={`absolute inset-y-0 left-0 w-[clamp(440px,37vw,520px)] overflow-y-auto font-sans text-neutral-900 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isContactOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <div className="flex min-h-full flex-col gap-4 p-4">
              <div className="drawer-card-item will-change-[transform,opacity] flex flex-col gap-5 rounded-3xl bg-neutral-100/70 p-6">
                <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  ● Available for Opportunities
                </span>

                <div className="flex aspect-[2/1] items-center justify-center rounded-xl border-4 border-neutral-900 bg-gradient-to-b from-white to-neutral-200 p-3 shadow-[0_3px_0_#c3cbd8,0_6px_12px_rgba(0,0,0,0.15)]">
                  <div className="flex h-full w-full items-center justify-center rounded-md border-2 border-neutral-900 text-center text-lg font-black tracking-widest">
                    #MAKETHEWEBFUNAGAIN
                  </div>
                </div>
              </div>

              <section className="drawer-card-item will-change-[transform,opacity] rounded-3xl bg-neutral-100/70 p-6">
                <h2 className="text-xs font-bold">Contact Me</h2>
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                  <a className="font-medium text-neutral-900 underline" href="mailto:satyamsharma.main@gmail.com">
                    satyamsharma.main@gmail.com
                  </a>
                  <br />
                  <a className="font-medium text-neutral-900 underline" href="tel:+917050174252">
                    +91-7050174252
                  </a>
                </p>
                <p className="mt-3 text-xs leading-relaxed text-neutral-600">
                  Feel free to reach out for software engineering roles, full-stack projects, or frontend collaborations.
                </p>
              </section>

              <section className="drawer-card-item will-change-[transform,opacity] flex flex-col gap-4 rounded-3xl bg-neutral-100/70 p-6">
                <h2 className="text-xs font-bold">About &amp; Work Style</h2>
                {[
                  [
                    'What type of work do you specialize in?',
                    'Full-stack web development, high-fidelity interactive interfaces (React, Next.js, Three.js/R3F), and scalable backend architectures (Node.js, Express, PostgreSQL, Supabase).',
                  ],
                  [
                    'What is your background?',
                    'B.Tech in Computer Science Engineering at USICT, New Delhi (2023–2027), with production experience at CoinFerenceX and URLyte.',
                  ],
                  [
                    'What are your core technical strengths?',
                    'React.js, TypeScript, Next.js, Tailwind CSS, PostgreSQL, REST APIs, and algorithmic problem solving.',
                  ],
                ].map(([q, a]) => (
                  <div key={q}>
                    <h3 className="text-xs font-bold">{q}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-600">{a}</p>
                  </div>
                ))}
              </section>

              <footer className="drawer-card-item will-change-[transform,opacity] mt-auto flex flex-col items-center gap-3 rounded-2xl bg-neutral-100/70 p-6 text-center">
                <span className="text-[11px] font-semibold tracking-widest text-neutral-500 uppercase">#MAKETHEWEBFUNAGAIN</span>
                <span
                  className="my-6 block origin-center leading-none font-black tracking-[0.05em] text-[#c084fc]"
                  style={{
                    fontSize: 'clamp(4rem, 7.5vw, 5.5rem)',
                    transform: 'scaleY(1.15)',
                    textShadow: '-2px -2px 0 #fde047, 2px 2px 0 #38bdf8, 0 3px 0 #f472b6',
                  }}
                >
                  satyam
                </span>
                <div className="mt-2 flex w-full justify-between text-[10px] font-semibold text-neutral-400 uppercase">
                  <span>&lt;3 Satyam Sharma</span>
                  <span>&copy;2026 Satyam</span>
                </div>
              </footer>
            </div>
          </aside>
          <nav className="absolute inset-y-0 right-0 flex w-11 flex-col items-center bg-white py-3">
            <button
              type="button"
              aria-label={isContactOpen ? 'Close contact' : 'Menu'}
              onClick={() => setIsContactOpen(false)}
              className={`shrink-0 ${isContactOpen ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <svg className="h-8 w-8 text-white" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="16" fill="#111" />
                {isContactOpen ? (
                  <path d="M11 11l10 10M21 11L11 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                ) : (
                  <>
                    <circle cx="11.5" cy="13" r="1.6" fill="currentColor" />
                    <circle cx="20.5" cy="13" r="1.6" fill="currentColor" />
                    <path d="M10.5 19c1.4 2 3.4 3 5.5 3s4.1-1 5.5-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
            <div
              ref={trackRef}
              aria-hidden
              className={`relative my-5 min-h-0 w-[5px] flex-1 rounded-full bg-neutral-200/60 transition-opacity duration-300 ${isContactOpen ? 'opacity-100' : 'opacity-0'}`}
            >
              <div ref={thumbRef} className="absolute top-0 h-[min(200px,100%)] w-full rounded-full bg-neutral-400" />
            </div>
            <div className="mt-auto mb-6 flex flex-col items-center gap-2">
              {(
                [
                  ['Skills', 'min-h-[70px]'],
                  ['Work', 'min-h-[60px]'],
                  ['Contact', 'min-h-[82px]'],
                ] as const
              ).map(([label, h], i) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  {i > 0 && <span className="h-px w-4 bg-neutral-300/60" />}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (label === 'Contact') setIsContactOpen((o) => !o)
                    }}
                    className={`group relative mx-auto cursor-pointer flex w-[26px] items-center justify-center px-0.5 py-2.5 font-sans text-[11px] font-bold tracking-[0.1em] text-neutral-900 uppercase ${h}`}
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-0 rounded-full border border-neutral-300/80 bg-white/90 transition-opacity duration-200 group-hover:opacity-100 ${label === 'Contact' && isContactOpen ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <span className="relative [writing-mode:vertical-rl]">{label}</span>
                  </button>
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
          <span
            aria-hidden
            className="absolute left-full top-0 h-5 w-5"
            style={{ background: 'radial-gradient(circle at 100% 100%, transparent 19.5px, #fff 20px)' }}
          />
          <span
            aria-hidden
            className="absolute left-full bottom-0 h-5 w-5"
            style={{ background: 'radial-gradient(circle at 100% 0, transparent 19.5px, #fff 20px)' }}
          />
        </div>
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
