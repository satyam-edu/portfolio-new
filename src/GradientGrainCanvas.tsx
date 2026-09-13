import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uSky0;
  uniform vec3 uSky1;
  uniform vec3 uSky2;
  uniform vec3 uSky3;

  // Precision-safe hash (avoids the banding/moire that sin()-based hashes show at scale)
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // linear-gradient(180deg, uSky0 0%, uSky1 45%, uSky2 80%, uSky3 100%), 0% = top
  vec3 sky(float t) {
    if (t < 0.45) return mix(uSky0, uSky1, t / 0.45);
    if (t < 0.80) return mix(uSky1, uSky2, (t - 0.45) / 0.35);
    return mix(uSky2, uSky3, (t - 0.80) / 0.20);
  }

  void main() {
    vec3 gradient = sky(1.0 - vUv.y);

    // Film-grain: re-randomize per pixel on a coarse time step so it flickers like real grain
    float frame = floor(uTime * 24.0);
    float grain = hash(gl_FragCoord.xy + frame * 37.0);
    grain = pow(grain, 2.2);

    vec3 color = gradient + (grain - 0.5) * 0.12;
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function GradientGrainCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // THREE.Color(hex) stores sRGB hex as *linear* internally (ColorManagement is on by
    // default), but this raw ShaderMaterial writes gl_FragColor straight to the screen with
    // no output encoding pass — so the linear value gets displayed as-is and looks gamma-darkened.
    // convertLinearToSRGB() undoes that conversion so the uniform matches the literal hex.
    const displayColor = (hex: string) => new THREE.Color(hex).convertLinearToSRGB()

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSky0: { value: displayColor('#0840cf') },
        uSky1: { value: displayColor('#2974eb') },
        uSky2: { value: displayColor('#7eb8e3') },
        uSky3: { value: displayColor('#dbeaf7') },
      },
    })

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    scene.add(quad)

    const resize = () => {
      const { clientWidth, clientHeight } = container
      renderer.setSize(clientWidth, clientHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const clock = new THREE.Clock()
    let raf: number
    const animate = () => {
      material.uniforms.uTime.value = clock.getElapsedTime()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      material.dispose()
      quad.geometry.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />
}
