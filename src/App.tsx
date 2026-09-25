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
  const [openPanel, setOpenPanel] = useState<'work' | 'projects' | 'contact' | null>(null)
  const isOpen = openPanel !== null
  const drawerRef = useRef<HTMLElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [butterflyIdx, setButterflyIdx] = useState(0)
  const desktopRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const enterBtnRef = useRef<HTMLSpanElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)
  const revealWidthRef = useRef(0)
  const slashRef = useRef<HTMLSpanElement>(null)
  const audioOptionRef = useRef<HTMLSpanElement>(null)
  const cameraView = useRef<CameraView>({ shift: 1, clouds: 0, throttled: false })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const eqRef = useRef<SVGSVGElement>(null)
  const eqTweenRef = useRef<gsap.core.Tween | null>(null)

  useEffect(() => {
    const audio = new Audio('/audio/29-MOTION.mp3')
    audio.loop = true
    audio.volume = 0.6
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  // pulse the rail's equalizer bars while the track plays; settle them flat when it's paused
  useEffect(() => {
    const bars = eqRef.current?.querySelectorAll('.eq-bar') ?? []
    eqTweenRef.current?.kill()
    eqTweenRef.current = isPlaying
      ? gsap.to(bars, {
          scaleY: () => gsap.utils.random(0.5, 1.4),
          duration: () => gsap.utils.random(0.3, 0.6),
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          stagger: { each: 0.12, from: 'random' },
        })
      : gsap.to(bars, { scaleY: 0.35, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
    return () => {
      eqTweenRef.current?.kill()
    }
  }, [isPlaying])

  useEffect(() => {
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const pct = Math.min(100, Math.round(((now - start) / LOAD_MS) * 100))
      setProgress(pct)
      if (pct < 100) {
        raf = requestAnimationFrame(tick)
      } else {
        // Loading just hit 100%: ENTER fades in right where the percentage sat (the reveal container is
        // still collapsed to 0 width). It then widens to its measured natural size — the row recentering
        // as it grows is what carries ENTER left, with no explicit transform of its own, so the ENTER-to-
        // slash gap stays the same 9px as the slash-to-audio gap.
        gsap
          .timeline()
          .to(enterBtnRef.current, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', clearProps: 'opacity' })
          .to(revealRef.current, { width: revealWidthRef.current, duration: 0.6, ease: 'power3.inOut' }, '+=0.35')
          .to(
            [slashRef.current, audioOptionRef.current],
            { opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out', clearProps: 'opacity' },
            '<0.15',
          )
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const triggerEnterTransition = () => {
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

  const handleEnterWithAudio = () => {
    if (progress < 100 || entered) return
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn('Autoplay blocked:', err))
    }
    triggerEnterTransition()
  }

  const handleEnterWithoutAudio = () => {
    if (progress < 100 || entered) return
    audioRef.current?.pause()
    setIsPlaying(false)
    triggerEnterTransition()
  }

  const toggleAudio = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn('Playback blocked:', err))
    }
  }

  // park the sidebar fully off-screen and invisible for the landing page (before first paint)
  useLayoutEffect(() => {
    gsap.set(navRef.current, { x: -(drawerW() + RAIL_W), opacity: 0 })
    gsap.set(drawerRef.current?.querySelectorAll('.drawer-card-item') ?? [], { opacity: 0, y: 24 })
    // hide the ENTER cluster until the loader hits 100%. Measure the reveal container's natural width
    // before collapsing it, so ENTER starts out exactly as wide as itself — lining up with the loading
    // percentage above it — and the tick effect's timeline knows how far to widen it back out later.
    revealWidthRef.current = revealRef.current?.scrollWidth ?? 0
    gsap.set(enterBtnRef.current, { opacity: 0, y: 10 })
    gsap.set(revealRef.current, { width: 0 })
    gsap.set([slashRef.current, audioOptionRef.current], { opacity: 0 })
  }, [])

  // keep the resting positions right if the viewport resizes (drawer width is viewport-relative)
  useEffect(() => {
    if (!entered) return
    const onResize = () => {
      const w = drawerW()
      gsap.set(navRef.current, { x: isOpen ? 0 : -w })
      gsap.set([sceneRef.current, desktopRef.current], { x: isOpen ? w : 0 })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [entered, isOpen])

  // Compositor-only: the fixed-width sidebar, the scene and the desktop icons all translate by the same amount,
  // so opening never triggers layout and the WebGL canvas never resizes.
  useEffect(() => {
    if (!entered) return
    const w = drawerW()
    const items = drawerRef.current?.querySelectorAll('.drawer-card-item') ?? []
    const slideDur = 1.15
    const to = { duration: slideDur, ease: 'power3.inOut', overwrite: 'auto', force3D: true } as const
    const slide = (at: number) => {
      tl.to(navRef.current, { x: isOpen ? 0 : -w, ...to }, at)
      tl.to(sceneRef.current, { x: isOpen ? w : 0, ...to }, at)
      tl.to(desktopRef.current, { x: isOpen ? w : 0, ...to }, at)
    }
    tlRef.current?.kill()
    const tl = (tlRef.current = gsap.timeline())
    // halve WebGL's frame rate while the panel travels; restore when the slide tweens end
    const freezeAt = isOpen ? 0 : 0.15
    tl.call(() => (cameraView.current.throttled = true), [], freezeAt)
    tl.call(() => (cameraView.current.throttled = false), [], freezeAt + slideDur)
    if (isOpen) {
      // cards cascade top-to-bottom as the panel settles, so no card paints during the fast part of the slide
      slide(0)
      tl.to(items, { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out', overwrite: 'auto' }, 1.0)
    } else {
      // content is gone before the panel starts collapsing
      tl.to(items, { opacity: 0, y: 24, duration: 0.15, ease: 'power2.in', overwrite: 'auto' }, 0)
      slide(0.15)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (progress < 100 || entered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleEnterWithAudio()
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
        {isOpen && <div className="pointer-events-auto absolute inset-0 z-10" onClick={() => setOpenPanel(null)} />}

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
            aria-hidden={!isOpen}
            inert={!isOpen}
            onScroll={(e) => {
              const el = e.currentTarget
              const max = el.scrollHeight - el.clientHeight
              const track = trackRef.current
              const thumb = thumbRef.current
              if (track && thumb) thumb.style.transform = `translateY(${max > 0 ? (el.scrollTop / max) * (track.clientHeight - thumb.offsetHeight) : 0}px)`
            }}
            className={`absolute inset-y-0 left-0 w-[clamp(440px,37vw,520px)] overflow-y-auto font-sans text-neutral-900 hyphens-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <div className="flex min-h-full flex-col gap-3 p-4">
              {openPanel === 'work' ? (
                <>
                  <section className="drawer-card-item will-change-[transform,opacity] rounded-2xl bg-[#f4f4f5] p-5">
                    <span className="text-[11px] font-semibold tracking-widest text-neutral-500 uppercase">Selected Work Experience</span>
                    <h2 className="mt-2 text-[15px] leading-snug font-semibold text-neutral-900">
                      Production engineering across full stack web applications and client platforms.
                    </h2>
                    <p className="mt-2 text-[12px] leading-normal font-normal text-neutral-500">
                      Built with React, Next.js, Node.js, and PostgreSQL, from responsive interfaces to REST APIs and role based
                      backend systems.
                    </p>
                  </section>

                  <section className="drawer-card-item will-change-[transform,opacity] rounded-2xl bg-[#f4f4f5] p-5">
                    <h2 className="mb-4 text-[13px] leading-snug font-semibold text-neutral-900">Experience</h2>
                    {[
                      {
                        org: 'CoinFerenceX',
                        role: 'Web Developer Intern',
                        dates: 'Jul 2026 – Aug 2026',
                        points: [
                          'Managed and maintained the company website end to end as the sole developer responsible for day to day upkeep.',
                          'Led a complete website upgrade covering structural design, technical enhancements, and performance optimizations.',
                          'Handled content updates, functionality checks, and performance monitoring, coordinating with senior team members for technical and strategic guidance.',
                        ],
                      },
                      {
                        org: 'Hotel Kamala Inn Grand',
                        role: 'Freelance Web Developer',
                        dates: 'Jul 2026',
                        points: [
                          'Built a production ready hotel booking website and admin dashboard handling reservations, room inventory, guest inquiries, and staff administration.',
                          'Developed responsive front end interfaces using React, TypeScript, Supabase Authentication, and PostgreSQL.',
                          'Collaborated directly with the client throughout the development lifecycle, gathering requirements and iterating on feedback.',
                        ],
                      },
                      {
                        org: 'URLyte',
                        role: 'Full Stack Developer',
                        dates: 'Apr 2026 – Jun 2026',
                        points: [
                          'Designed reusable, responsive React components to boost UI consistency across product screens.',
                          'Built and integrated REST APIs connecting frontend applications with backend services for reliable data flow.',
                          'Worked with PostgreSQL databases, writing optimized SQL queries and improving application performance.',
                          'Implemented JWT authentication and role based access control, alongside code reviews, testing, and bug fixes.',
                        ],
                      },
                    ].map((job, i) => (
                      <div key={job.org} className={i > 0 ? 'mt-5 border-t border-neutral-200 pt-5' : ''}>
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-[12px] leading-snug font-semibold text-neutral-900">{job.org}</h3>
                          <span className="shrink-0 text-[10.5px] font-medium text-neutral-400">{job.dates}</span>
                        </div>
                        <span className="text-[11.5px] font-medium text-neutral-500">{job.role}</span>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4">
                          {job.points.map((pt) => (
                            <li key={pt} className="text-[11.5px] leading-normal font-normal text-neutral-500">
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                </>
              ) : openPanel === 'projects' ? (
                <>
                  <section className="drawer-card-item will-change-[transform,opacity] rounded-2xl bg-[#f4f4f5] p-5">
                    <h2 className="mb-4 text-[13px] leading-snug font-semibold text-neutral-900">Featured Projects</h2>
                    {[
                      {
                        name: 'UniTrack — AI Powered Attendance Tracking PWA',
                        points: [
                          'Progressive Web App with 13+ screens for attendance workflows, featuring optimistic UI updates, automated tracking, and accessible layouts.',
                        ],
                        stack: 'Next.js, React, TypeScript, Supabase, PostgreSQL, Tailwind CSS, Google Gemini',
                      },
                      {
                        name: 'TripMate — Travel Companion Platform',
                        points: [
                          'Responsive travel platform with intuitive user flows for trip discovery, host dashboards, and scalable backend management.',
                        ],
                        stack: 'React, TypeScript, Node.js, Express.js, Prisma ORM, PostgreSQL',
                      },
                    ].map((proj, i) => (
                      <div key={proj.name} className={i > 0 ? 'mt-5 border-t border-neutral-200 pt-5' : ''}>
                        <h3 className="text-[12px] leading-snug font-semibold text-neutral-900">{proj.name}</h3>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4">
                          {proj.points.map((pt) => (
                            <li key={pt} className="text-[11.5px] leading-normal font-normal text-neutral-500">
                              {pt}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[11px] leading-normal font-medium text-neutral-400">Stack: {proj.stack}</p>
                      </div>
                    ))}
                  </section>
                </>
              ) : (
                <>
              <div className="drawer-card-item will-change-[transform,opacity] relative flex aspect-[5/4] flex-col items-center overflow-hidden rounded-2xl bg-[#f4f4f5] pt-7">
                {/* line-art meadow behind the plate, echoing the grass & butterflies scene */}
                <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 400 320" preserveAspectRatio="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <g stroke="#b9d3ad" strokeWidth="1.5">
                    <path d="M-5 70c20 0 28-18 42-14 10 3 8 16 20 14" />
                    <path d="M50 12c-4 14-16 18-26 16" />
                    <path d="M150 54c8-14 26-16 36-6 6-10 22-8 26 4" />
                    <path d="M345 50c6-16 28-18 38-4 6-6 16-4 22 4" />
                    <path d="M-5 225c22-14 50-12 64 6" />
                    <path d="M10 250c14-8 34-10 48 0" />
                    <path d="M340 310c-2-40 20-60 60-66" />
                    <path d="M150 320c18-24 60-30 94-14 14-10 36-8 48 4" />
                  </g>
                  <g stroke="#c7c3e6" strokeWidth="1.5">
                    <path d="M308 72v14M301 79h14" />
                    <path d="M322 92v8M318 96h8" />
                  </g>
                  <symbol id="drawer-bfly" viewBox="-10 -10 20 20" overflow="visible">
                    <ellipse cx="-3.2" cy="-2" rx="3.4" ry="4.6" transform="rotate(-25 -3.2 -2)" fill="#ede7f7" stroke="#c9b7e0" strokeWidth="1.3" />
                    <ellipse cx="3.2" cy="-2" rx="3.4" ry="4.6" transform="rotate(25 3.2 -2)" fill="#ede7f7" stroke="#c9b7e0" strokeWidth="1.3" />
                    <ellipse cx="0" cy="4" rx="2.6" ry="3.2" fill="#e7b8c6" />
                  </symbol>
                  <use href="#drawer-bfly" x="163" y="60" width="20" height="20" transform="rotate(12 173 70)" />
                  <use href="#drawer-bfly" x="52" y="138" width="17" height="17" transform="rotate(-10 60 146)" />
                  <use href="#drawer-bfly" x="340" y="168" width="17" height="17" transform="rotate(18 348 176)" />
                  <use href="#drawer-bfly" x="284" y="228" width="17" height="17" transform="rotate(-14 292 236)" />
                  <g stroke="#b8b4dc" strokeWidth="1.5">
                    <path d="M216 312c2-22 2-36 12-50" />
                    <path d="M198 312c-2-14 0-24 -6-34" />
                  </g>
                  <g stroke="#c07a92" strokeWidth="1.3" fill="#e9a9bd">
                    <path d="M228 248a6 6 0 1 1 8 6 6 6 0 1 1-4 9 6 6 0 1 1-9-2 6 6 0 1 1-2-9 6 6 0 1 1 7-4z" />
                    <path d="M190 270a5 5 0 1 1 7 5 5 5 0 1 1-4 8 5 5 0 1 1-8-2 5 5 0 1 1-1-8 5 5 0 1 1 6-3z" />
                  </g>
                </svg>

                <span className="relative text-[13px] font-medium text-neutral-800">Available for Opportunities</span>

                <div className="relative my-auto w-[min(76%,300px)] -rotate-[8deg] rounded-xl border border-neutral-300 bg-white p-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
                  <div className="relative flex flex-col items-center rounded-lg border-2 border-[#d9d7ec] px-4 pt-3 pb-2.5 text-center">
                    <span aria-hidden className="absolute top-2 left-[30%] h-1.5 w-2.5 rounded-full bg-neutral-200" />
                    <span aria-hidden className="absolute top-2 right-[30%] h-1.5 w-2.5 rounded-full bg-neutral-200" />
                    <span className="mt-1.5 text-[11px] font-semibold tracking-wide text-neutral-500">SATYAM SHARMA</span>
                    <span className="flex items-center gap-1 text-[clamp(2rem,3.4vw,2.6rem)] leading-none font-black tracking-tight text-[#c5c2e8]">
                      S:S
                      <svg aria-hidden className="h-[0.8em] w-[0.8em]" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="12" fill="currentColor" />
                        <circle cx="8.5" cy="10" r="1.6" fill="#fff" />
                        <circle cx="15.5" cy="10" r="1.6" fill="#fff" />
                        <path d="M7.5 14.5c1.2 1.8 2.8 2.6 4.5 2.6s3.3-.8 4.5-2.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      2026
                    </span>
                    <span className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-neutral-500">
                      <i className="h-px w-3 bg-neutral-300" />
                      #MAKETHEWEBFUNAGAIN
                      <i className="h-px w-3 bg-neutral-300" />
                    </span>
                  </div>
                </div>
              </div>

              <section className="drawer-card-item will-change-[transform,opacity] rounded-2xl bg-[#f4f4f5] p-5">
                <h2 className="mb-1 text-[13px] leading-snug font-semibold text-neutral-900">Contact Me</h2>
                <p className="text-[12px] leading-normal font-normal text-neutral-500">
                  For enquiries, reach out directly at{' '}
                  <a className="underline underline-offset-2" href="mailto:satyamsharma.main@gmail.com">
                    satyamsharma.main@gmail.com
                  </a>
                  .
                </p>
                <p className="mt-3 text-[12px] leading-normal font-normal text-neutral-500">
                  Feel free to reach out for software engineering roles, full stack projects, or frontend collaborations.
                </p>
              </section>

              <section className="drawer-card-item will-change-[transform,opacity] rounded-2xl bg-[#f4f4f5] p-5">
                <h2 className="mb-3 text-[13px] leading-snug font-semibold tracking-tight text-neutral-900">Frequently Asked Questions</h2>
                {[
                  [
                    'What type of work do you like to do?',
                    [
                      'I focus on building full stack web applications and interactive web experiences. Most of my work revolves around React, Next.js, and TypeScript on the frontend, alongside robust backend services using Node.js, Express, and PostgreSQL.',
                      'I also enjoy creative development, building dynamic 3D web environments with React Three Fiber, GLSL shaders, and tactile UI animations that make the web memorable.',
                    ],
                  ],
                  [
                    'What is your background?',
                    [
                      'I am pursuing a Bachelor of Technology in Computer Science and Engineering at USICT, New Delhi (2023 to 2027).',
                      'Alongside academics, I have worked as a Frontend Developer Intern at CoinFerenceX, built production booking platforms as a freelance developer, and created full stack products at URLyte.',
                    ],
                  ],
                  [
                    'What are your core technical strengths?',
                    [
                      'My core stack includes React, Next.js, TypeScript, Tailwind CSS, PostgreSQL, and Node.js. I am comfortable working with REST APIs, JWT authentication, database query optimization, and UI performance.',
                      'I also actively practice Data Structures and Algorithms in C++ and stay focused on clean, modular component architecture.',
                    ],
                  ],
                  [
                    'What is your development process like?',
                    [
                      'I typically break work down into clear stages: understanding the product scope and architecture, building responsive components with crisp user interactions, and wiring up scalable APIs and database schemas.',
                      'I prioritize smooth state management, clean developer workflows with Git, and shipping production ready interfaces that feel responsive across all screen sizes.',
                    ],
                  ],
                  [
                    'Are you open to internships or full time roles?',
                    ['Yes, I am actively open to frontend, backend, or full stack software engineering opportunities, internships, and select freelance builds.'],
                  ],
                ].map(([q, paragraphs]) => (
                  <div key={q as string} className="mt-4 first-of-type:mt-0">
                    <h3 className="mb-1.5 text-[12px] leading-snug font-semibold text-neutral-900">{q as string}</h3>
                    {(paragraphs as string[]).map((p, i) => (
                      <p key={i} className="mb-2.5 text-[11.5px] leading-normal font-normal text-neutral-500 last:mb-0">
                        {p}
                      </p>
                    ))}
                  </div>
                ))}
              </section>
                </>
              )}

              {openPanel === 'contact' && (
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
              )}
            </div>
          </aside>
          <nav className="absolute inset-y-0 right-0 flex w-11 flex-col items-center bg-white py-3">
            <button
              type="button"
              aria-label={isOpen ? 'Close panel' : 'Menu'}
              onClick={() => setOpenPanel(null)}
              className={`shrink-0 ${isOpen ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <svg className="h-8 w-8 text-white" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="16" fill="#111" />
                {isOpen ? (
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
              className={`relative my-5 min-h-0 w-[5px] flex-1 rounded-full bg-neutral-200/60 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
            >
              <div ref={thumbRef} className="absolute top-0 h-[min(200px,100%)] w-full rounded-full bg-neutral-400" />
            </div>
            <div className="mt-auto mb-6 flex flex-col items-center gap-2">
              {(
                [
                  ['Skills', 'min-h-[70px]'],
                  ['Work', 'min-h-[60px]'],
                  ['Projects', 'min-h-[90px]'],
                  ['Contact', 'min-h-[82px]'],
                ] as const
              ).map(([label, h], i) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  {i > 0 && <span className="h-px w-4 bg-neutral-300/60" />}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const key = label.toLowerCase()
                      if (key === 'work' || key === 'projects' || key === 'contact') setOpenPanel((p) => (p === key ? null : key))
                    }}
                    className={`group relative mx-auto cursor-pointer flex w-[26px] items-center justify-center px-0.5 py-2.5 font-sans text-[11px] font-bold tracking-[0.1em] text-neutral-900 uppercase ${h}`}
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-0 rounded-full border border-neutral-300/80 bg-white/90 transition-opacity duration-200 group-hover:opacity-100 ${openPanel === label.toLowerCase() ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <span className="relative [writing-mode:vertical-rl]">{label}</span>
                  </button>
                </div>
              ))}
            </div>
            <svg
              ref={eqRef}
              onClick={toggleAudio}
              role="button"
              aria-label={isPlaying ? 'Mute audio' : 'Play audio'}
              className="h-5 w-5 shrink-0 cursor-pointer text-neutral-900 transition-opacity hover:opacity-50"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {[
                [5, 4],
                [9, 12],
                [13, 6],
                [17, 16],
                [21, 2],
              ].map(([x, len]) => (
                <line key={x} className="eq-bar" x1={x} y1={12 - len / 2} x2={x} y2={12 + len / 2} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
              ))}
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
              style={{
                gridArea: '1 / 1',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '9px',
                color: 'white',
                pointerEvents: progress >= 100 ? 'auto' : 'none',
              }}
            >
              <span
                ref={enterBtnRef}
                onClick={handleEnterWithAudio}
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
              <div ref={revealRef} className="shrink-0 overflow-hidden" style={{ display: 'flex', alignItems: 'flex-end', gap: '9px' }}>
                <span
                  ref={slashRef}
                  aria-hidden
                  className="shrink-0"
                  style={{
                    alignSelf: 'center',
                    // the 14deg rotation paints ~3.1px wider than this 2px box on each side, eating into
                    // whichever neighboring gap has no buffer; matching margins on both sides keep the
                    // painted edges inside revealRef's clip and keep the ENTER/slash and slash/audio gaps equal
                    marginLeft: '3.5px',
                    marginRight: '3.5px',
                    width: '2px',
                    height: '26px',
                    background: 'white',
                    transform: 'rotate(14deg)',
                  }}
                />
                <span
                  ref={audioOptionRef}
                  onClick={handleEnterWithoutAudio}
                  className="shrink-0 cursor-pointer font-sans transition-opacity hover:opacity-60"
                  style={{ fontSize: '12px', fontWeight: 400, lineHeight: 1.05, textAlign: 'center', whiteSpace: 'nowrap' }}
                >
                  Enter site
                  <br />
                  <span style={{ display: 'inline-block', paddingBottom: '1px', borderBottom: '1px solid white' }}>
                    without audio
                  </span>
                </span>
              </div>
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
