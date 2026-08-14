'use client'

import { memo } from 'react'

// Pure-CSS drifting cloud backdrop for the landing/dashboard/profile pages.
// Replaces the former three.js CloudScene: same sky gradient and cloud art,
// but plain DOM + CSS animation, so these pages don't ship three.js at all.

function seededRandom(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 4294967295
  }
}

type CloudDef = {
  top: number      // %
  left: number     // %
  width: number    // vw
  tex: number      // 1..3 → /Cloud{n}.svg
  dur: number      // s
  delay: number    // s (negative = start mid-cycle)
  amp: number      // vw drift amplitude
  opacity: number
}

// Three depth bands: higher clouds are smaller and fainter (further away)
const CLOUDS: CloudDef[] = (() => {
  const r = seededRandom(7)
  const defs: CloudDef[] = []
  const bands = [
    { count: 5, top0: 3,  top1: 20, w0: 10, w1: 17, op: 0.8 },
    { count: 5, top0: 24, top1: 48, w0: 15, w1: 25, op: 0.9 },
    { count: 4, top0: 52, top1: 76, w0: 24, w1: 40, op: 1.0 },
  ]
  bands.forEach(({ count, top0, top1, w0, w1, op }) => {
    for (let i = 0; i < count; i++) {
      defs.push({
        top: top0 + r() * (top1 - top0),
        left: -10 + (i + r() * 0.8) * (110 / count),
        width: w0 + r() * (w1 - w0),
        tex: 1 + Math.floor(r() * 3),
        dur: 22 + r() * 20,
        delay: -r() * 40,
        amp: 1.5 + r() * 2.5,
        opacity: op,
      })
    }
  })
  return defs
})()

export default memo(function CloudBackdrop() {
  return (
    <div
      aria-hidden
      className="cloud-layer"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'linear-gradient(to bottom, #1e4fa0 0%, #3476c8 28%, #5ca8e0 58%, #90caf0 80%, #c8e8f8 100%)',
      }}
    >
      <style>{`
        @keyframes cloud-drift {
          from { transform: translate3d(calc(var(--amp) * var(--cloud-scale) * -1), 0, 0); }
          to   { transform: translate3d(calc(var(--amp) * var(--cloud-scale)), 0, 0); }
        }
        /* Cloud sizes are authored in vw, which reads far too small on a phone:
           a 30vw cloud is ~120px on a 390px screen. Scale them up as the
           viewport narrows so the sky stays fluffy at every width. */
        .cloud-layer { --cloud-scale: 1; }
        @media (max-width: 1100px) { .cloud-layer { --cloud-scale: 1.9; } }
        @media (max-width: 768px)  { .cloud-layer { --cloud-scale: 2.8; } }
        @media (max-width: 480px)  { .cloud-layer { --cloud-scale: 3.6; } }
        .cloud-sprite { width: calc(var(--w) * var(--cloud-scale)); }
        @media (prefers-reduced-motion: reduce) {
          .cloud-sprite { animation: none !important; }
        }
      `}</style>
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="cloud-sprite"
          style={{
            position: 'absolute',
            top: `${c.top}%`,
            left: `${c.left}%`,
            ['--w' as string]: `${c.width}vw`,
            aspectRatio: '16 / 9',
            backgroundImage: `url(/Cloud${c.tex}.svg)`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            opacity: c.opacity,
            ['--amp' as string]: `${c.amp}vw`,
            animation: `cloud-drift ${c.dur}s ease-in-out ${c.delay}s infinite alternate`,
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  )
})
