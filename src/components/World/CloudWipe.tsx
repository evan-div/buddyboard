'use client'

import { useEffect, useRef, useState } from 'react'

export type WipePhase = 'idle' | 'entering' | 'covered' | 'exiting' | 'done'

interface Props {
  phase: WipePhase
  onCovered?: () => void
  onDone?: () => void
}

const SKY = 'linear-gradient(to bottom, #1e4fa0 0%, #3476c8 28%, #5ca8e0 58%, #90caf0 80%, #c8e8f8 100%)'
const SLIDE = 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)'

type Cloud = { src: string; top: string; left: string; width: string }

// Left panel — clouds staggered top→bottom, slightly overhanging left edge
const LEFT_CLOUDS: Cloud[] = [
  { src: '/Cloud2.svg', top: '0%',  left: '-18%', width: '130%' },
  { src: '/Cloud1.svg', top: '20%', left: '-22%', width: '140%' },
  { src: '/Cloud3.svg', top: '40%', left: '-14%', width: '125%' },
  { src: '/Cloud2.svg', top: '60%', left: '-20%', width: '134%' },
  { src: '/Cloud1.svg', top: '80%', left: '-12%', width: '120%' },
]

// Right panel — different SVG order and vertical offsets for variety
const RIGHT_CLOUDS: Cloud[] = [
  { src: '/Cloud3.svg', top: '10%', left: '-20%', width: '128%' },
  { src: '/Cloud2.svg', top: '29%', left: '-16%', width: '122%' },
  { src: '/Cloud1.svg', top: '49%', left: '-24%', width: '140%' },
  { src: '/Cloud3.svg', top: '68%', left: '-14%', width: '124%' },
  { src: '/Cloud2.svg', top: '86%', left: '-20%', width: '130%' },
]

export default function CloudWipe({ phase, onCovered, onDone }: Props) {
  // Initialise from prop so 'covered' phase renders correctly on first mount
  const [panelsIn, setPanelsIn] = useState(phase === 'covered')
  const [whiteIn, setWhiteIn]   = useState(phase === 'covered')

  // Keep callbacks in refs so effects never go stale
  const cbCovered = useRef(onCovered)
  const cbDone    = useRef(onDone)
  useEffect(() => { cbCovered.current = onCovered }, [onCovered])
  useEffect(() => { cbDone.current    = onDone    }, [onDone])

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = []

    if (phase === 'entering') {
      setPanelsIn(true)
      ts.push(setTimeout(() => {
        setWhiteIn(true)
        ts.push(setTimeout(() => cbCovered.current?.(), 250))
      }, 650))
    } else if (phase === 'covered') {
      setPanelsIn(true)
      setWhiteIn(true)
    } else if (phase === 'exiting') {
      setWhiteIn(false)
      ts.push(setTimeout(() => {
        setPanelsIn(false)
        ts.push(setTimeout(() => cbDone.current?.(), 650))
      }, 250))
    } else {
      // idle / done
      setPanelsIn(false)
      setWhiteIn(false)
    }

    return () => ts.forEach(clearTimeout)
  }, [phase])

  const active = panelsIn || whiteIn

  const panel = (side: 'left' | 'right', translateOut: string, clouds: Cloud[]) => (
    <div style={{
      position: 'fixed', top: 0, bottom: 0, [side]: 0,
      width: '55%',
      background: SKY,
      zIndex: 200,
      overflow: 'hidden',
      transition: SLIDE,
      transform: panelsIn ? 'translateX(0%)' : `translateX(${translateOut})`,
      pointerEvents: active ? 'auto' : 'none',
    }}>
      {clouds.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={c.src} alt="" style={{
          position: 'absolute', top: c.top, left: c.left, width: c.width,
          opacity: 0.88, userSelect: 'none', pointerEvents: 'none',
        }} />
      ))}
    </div>
  )

  return (
    <>
      {panel('left',  '-100%', LEFT_CLOUDS)}
      {panel('right', '100%',  RIGHT_CLOUDS)}

      {/* White flash — covers the centre join and signals full coverage */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 201,
        background: 'white',
        opacity: whiteIn ? 1 : 0,
        transition: 'opacity 0.25s ease',
        pointerEvents: whiteIn ? 'auto' : 'none',
      }} />
    </>
  )
}
