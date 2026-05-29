'use client'

import { useEffect, useRef, useState } from 'react'

export type WipePhase = 'idle' | 'entering' | 'covered' | 'exiting' | 'done'

interface Props {
  phase: WipePhase
  onCovered?: () => void
  onDone?: () => void
}

// Each cloud is an independent element — no panel containers.
// Left-group flies from off-screen-left and rests in the right half.
// Right-group flies from off-screen-right and rests in the left half.
// They cross through the centre during both entry and exit.
type Cloud = { src: string; top: string; idleX: string; covX: string; w: string }

const L_CLOUDS: Cloud[] = [
  { src: '/Cloud2.svg', top: '0%',  idleX: '-110vw', covX: '30vw', w: '70vw' },
  { src: '/Cloud1.svg', top: '20%', idleX: '-110vw', covX: '18vw', w: '80vw' },
  { src: '/Cloud3.svg', top: '41%', idleX: '-110vw', covX: '38vw', w: '65vw' },
  { src: '/Cloud2.svg', top: '62%', idleX: '-110vw', covX: '25vw', w: '75vw' },
  { src: '/Cloud1.svg', top: '82%', idleX: '-110vw', covX: '12vw', w: '70vw' },
]

const R_CLOUDS: Cloud[] = [
  { src: '/Cloud3.svg', top: '10%', idleX: '110vw',  covX: '-45vw', w: '70vw' },
  { src: '/Cloud1.svg', top: '30%', idleX: '110vw',  covX: '-32vw', w: '80vw' },
  { src: '/Cloud2.svg', top: '51%', idleX: '110vw',  covX: '-50vw', w: '65vw' },
  { src: '/Cloud3.svg', top: '72%', idleX: '110vw',  covX: '-38vw', w: '75vw' },
  { src: '/Cloud2.svg', top: '91%', idleX: '110vw',  covX: '-28vw', w: '70vw' },
]

const ALL_CLOUDS = [...L_CLOUDS, ...R_CLOUDS]
const MOVE = 'transform 0.95s cubic-bezier(0.4, 0, 0.2, 1)'

export default function CloudWipe({ phase, onCovered, onDone }: Props) {
  const [cloudsIn, setCloudsIn] = useState(phase === 'covered')
  const [whiteIn,  setWhiteIn]  = useState(phase === 'covered')

  const cbCovered = useRef(onCovered)
  const cbDone    = useRef(onDone)
  useEffect(() => { cbCovered.current = onCovered }, [onCovered])
  useEffect(() => { cbDone.current    = onDone    }, [onDone])

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = []

    if (phase === 'entering') {
      setCloudsIn(true)
      // White washes in while clouds are crossing the centre
      ts.push(setTimeout(() => setWhiteIn(true), 550))
      // Navigate once white is fully opaque
      ts.push(setTimeout(() => cbCovered.current?.(), 900))
    } else if (phase === 'covered') {
      setCloudsIn(true)
      setWhiteIn(true)
    } else if (phase === 'exiting') {
      // White and clouds start together — as white clears, clouds are already sweeping outward.
      // Double rAF guarantees a painted covered-frame exists before we flip both states.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCloudsIn(false)
          setWhiteIn(false)
        })
      })
      ts.push(setTimeout(() => cbDone.current?.(), 1100))
    } else {
      // idle / done
      setCloudsIn(false)
      setWhiteIn(false)
    }

    return () => ts.forEach(clearTimeout)
  }, [phase])

  const active = cloudsIn || whiteIn

  return (
    <>
      {ALL_CLOUDS.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={c.src}
          alt=""
          style={{
            position: 'fixed',
            top: c.top,
            left: 0,
            width: c.w,
            zIndex: 200,
            transform: `translateX(${cloudsIn ? c.covX : c.idleX})`,
            transition: MOVE,
            willChange: 'transform',
            opacity: 0.95,
            pointerEvents: active ? 'auto' : 'none',
            userSelect: 'none',
          }}
        />
      ))}

      {/* White flash — covers centre overlap and signals full coverage */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 201,
        background: 'white',
        opacity: whiteIn ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: whiteIn ? 'auto' : 'none',
      }} />
    </>
  )
}
