'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type WipePhase = 'idle' | 'entering' | 'covered' | 'exiting' | 'done'

interface Props {
  phase: WipePhase
  onCovered?: () => void
  onDone?: () => void
}

type Cloud = { src: string; top: string; idleX: string; covX: string; w: string }

const L_CLOUDS: Cloud[] = [
  { src: '/Cloud2.svg', top: '-3%', idleX: '-120vw', covX: '28vw', w: '75vw' },
  { src: '/Cloud1.svg', top: '11%', idleX: '-120vw', covX: '18vw', w: '85vw' },
  { src: '/Cloud3.svg', top: '24%', idleX: '-120vw', covX: '34vw', w: '70vw' },
  { src: '/Cloud2.svg', top: '37%', idleX: '-120vw', covX: '14vw', w: '80vw' },
  { src: '/Cloud1.svg', top: '51%', idleX: '-120vw', covX: '30vw', w: '75vw' },
  { src: '/Cloud3.svg', top: '64%', idleX: '-120vw', covX: '20vw', w: '70vw' },
  { src: '/Cloud2.svg', top: '77%', idleX: '-120vw', covX: '10vw', w: '85vw' },
  { src: '/Cloud1.svg', top: '90%', idleX: '-120vw', covX: '26vw', w: '75vw' },
]

const R_CLOUDS: Cloud[] = [
  { src: '/Cloud3.svg', top: '4%',  idleX: '120vw', covX: '-40vw', w: '75vw' },
  { src: '/Cloud1.svg', top: '17%', idleX: '120vw', covX: '-52vw', w: '80vw' },
  { src: '/Cloud2.svg', top: '30%', idleX: '120vw', covX: '-44vw', w: '70vw' },
  { src: '/Cloud3.svg', top: '44%', idleX: '120vw', covX: '-36vw', w: '85vw' },
  { src: '/Cloud1.svg', top: '58%', idleX: '120vw', covX: '-48vw', w: '75vw' },
  { src: '/Cloud2.svg', top: '71%', idleX: '120vw', covX: '-40vw', w: '70vw' },
  { src: '/Cloud3.svg', top: '84%', idleX: '120vw', covX: '-30vw', w: '80vw' },
  { src: '/Cloud1.svg', top: '96%', idleX: '120vw', covX: '-44vw', w: '75vw' },
]

const ALL_CLOUDS = [...L_CLOUDS, ...R_CLOUDS]

const ENTER_DUR = 1200
const EXIT_DUR  = 2400
const MOVE_ENTER = `transform ${ENTER_DUR}ms cubic-bezier(0.4, 0, 0.2, 1)`
const MOVE_EXIT  = `transform ${EXIT_DUR}ms cubic-bezier(0.25, 0.1, 0.25, 1)`

export default function CloudWipe({ phase, onCovered, onDone }: Props) {
  // Transforms are driven via DOM refs — bypasses React render cycles so the
  // entry animation starts in the same microtask as the phase change, not
  // one or two browser paint cycles later.
  const cloudRefs = useRef<(HTMLImageElement | null)[]>([])
  const [whiteIn,  setWhiteIn]  = useState(phase === 'covered')
  const [ptrBlock, setPtrBlock] = useState(phase === 'covered')

  const cbCovered = useRef(onCovered)
  const cbDone    = useRef(onDone)
  useEffect(() => { cbCovered.current = onCovered }, [onCovered])
  useEffect(() => { cbDone.current    = onDone    }, [onDone])

  // Set initial positions before first paint to prevent flash.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const inCovered = phase === 'covered'
    cloudRefs.current.forEach((el, i) => {
      if (!el) return
      el.style.transition = 'none'
      el.style.transform  = `translateX(${inCovered ? ALL_CLOUDS[i].covX : ALL_CLOUDS[i].idleX})`
    })
  }, [])

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = []

    function sweepIn(animated: boolean) {
      cloudRefs.current.forEach((el, i) => {
        if (!el) return
        el.style.transition = animated ? MOVE_ENTER : 'none'
        el.style.transform  = `translateX(${ALL_CLOUDS[i].covX})`
      })
    }
    function sweepOut() {
      cloudRefs.current.forEach((el, i) => {
        if (!el) return
        el.style.transition = MOVE_EXIT
        el.style.transform  = `translateX(${ALL_CLOUDS[i].idleX})`
      })
    }
    function snapToIdle() {
      cloudRefs.current.forEach((el, i) => {
        if (!el) return
        el.style.transition = 'none'
        el.style.transform  = `translateX(${ALL_CLOUDS[i].idleX})`
      })
    }

    if (phase === 'entering') {
      setPtrBlock(true)
      sweepIn(true)
      ts.push(setTimeout(() => setWhiteIn(true), 700))
      ts.push(setTimeout(() => cbCovered.current?.(), 1300))

    } else if (phase === 'covered') {
      setPtrBlock(true)
      sweepIn(false)
      setWhiteIn(true)

    } else if (phase === 'exiting') {
      // Double rAF: ensures browser has painted the covered state before we reverse.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sweepOut()
          setWhiteIn(false)
          ts.push(setTimeout(() => {
            setPtrBlock(false)
            cbDone.current?.()
          }, EXIT_DUR + 100))
        })
      })

    } else {
      setPtrBlock(false)
      setWhiteIn(false)
      snapToIdle()
    }

    return () => ts.forEach(clearTimeout)
  }, [phase])

  return (
    <>
      {ALL_CLOUDS.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          ref={el => { cloudRefs.current[i] = el }}
          src={c.src}
          alt=""
          style={{
            position: 'fixed',
            top: c.top,
            left: 0,
            width: c.w,
            zIndex: 200,
            willChange: 'transform',
            opacity: 0.95,
            pointerEvents: ptrBlock ? 'auto' : 'none',
            userSelect: 'none',
          }}
        />
      ))}

      <div style={{
        position: 'fixed', inset: 0, zIndex: 201,
        background: 'white',
        opacity: whiteIn ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: (whiteIn || ptrBlock) ? 'auto' : 'none',
      }} />
    </>
  )
}
