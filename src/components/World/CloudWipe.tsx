'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { wipeActive } from '@/lib/wipeState'

export type WipePhase = 'idle' | 'entering' | 'covered' | 'exiting' | 'done'

interface Props {
  phase: WipePhase
  onCovered?: () => void
  onDone?: () => void
}

type Cloud = { src: string; top: string; idleX: string; covX: string; w: string }

const L_CLOUDS: Cloud[] = [
  { src: '/Cloud2.svg', top: '-3%', idleX: '-120vw', covX: '28vw', w: '75vw' },
  { src: '/Cloud1.svg', top: '18%', idleX: '-120vw', covX: '18vw', w: '85vw' },
  { src: '/Cloud3.svg', top: '40%', idleX: '-120vw', covX: '34vw', w: '70vw' },
  { src: '/Cloud2.svg', top: '62%', idleX: '-120vw', covX: '14vw', w: '80vw' },
  { src: '/Cloud1.svg', top: '83%', idleX: '-120vw', covX: '26vw', w: '75vw' },
]

const R_CLOUDS: Cloud[] = [
  { src: '/Cloud3.svg', top: '8%',  idleX: '120vw', covX: '-40vw', w: '75vw' },
  { src: '/Cloud1.svg', top: '29%', idleX: '120vw', covX: '-52vw', w: '80vw' },
  { src: '/Cloud2.svg', top: '51%', idleX: '120vw', covX: '-36vw', w: '85vw' },
  { src: '/Cloud3.svg', top: '72%', idleX: '120vw', covX: '-44vw', w: '70vw' },
  { src: '/Cloud1.svg', top: '91%', idleX: '120vw', covX: '-30vw', w: '80vw' },
]

const ALL_CLOUDS = [...L_CLOUDS, ...R_CLOUDS]

const ENTER_DUR = 1200
const EXIT_DUR  = 2400
const MOVE_ENTER = `transform ${ENTER_DUR}ms cubic-bezier(0.4, 0, 0.2, 1)`
const MOVE_EXIT  = `transform ${EXIT_DUR}ms cubic-bezier(0.25, 0.1, 0.25, 1)`

export default function CloudWipe({ phase, onCovered, onDone }: Props) {
  const cloudRefs = useRef<(HTMLImageElement | null)[]>([])
  const [whiteIn,  setWhiteIn]  = useState(phase === 'covered')
  const [ptrBlock, setPtrBlock] = useState(phase === 'covered')

  const cbCovered = useRef(onCovered)
  const cbDone    = useRef(onDone)
  useEffect(() => { cbCovered.current = onCovered }, [onCovered])
  useEffect(() => { cbDone.current    = onDone    }, [onDone])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const inCovered = phase === 'covered'
    cloudRefs.current.forEach((el, i) => {
      if (!el) return
      el.style.willChange = inCovered ? 'transform' : 'auto'
      el.style.transition = 'none'
      el.style.transform  = `translateX(${inCovered ? ALL_CLOUDS[i].covX : ALL_CLOUDS[i].idleX})`
    })
  }, [])

  useLayoutEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = []

    function promote() {
      cloudRefs.current.forEach(el => { if (el) el.style.willChange = 'transform' })
    }
    function demote() {
      cloudRefs.current.forEach(el => { if (el) el.style.willChange = 'auto' })
    }
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

    if (phase === 'entering') {
      wipeActive.current = true
      setPtrBlock(true)
      promote()
      sweepIn(true)
      ts.push(setTimeout(() => setWhiteIn(true), 700))
      ts.push(setTimeout(() => cbCovered.current?.(), 1300))

    } else if (phase === 'covered') {
      wipeActive.current = true
      setPtrBlock(true)
      promote()
      sweepIn(false)
      setWhiteIn(true)

    } else if (phase === 'exiting') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sweepOut()
          setWhiteIn(false)
          ts.push(setTimeout(() => {
            wipeActive.current = false
            demote()
            setPtrBlock(false)
            cbDone.current?.()
          }, EXIT_DUR + 100))
        })
      })

    } else {
      wipeActive.current = false
      demote()
      setPtrBlock(false)
      setWhiteIn(false)
      cloudRefs.current.forEach((el, i) => {
        if (!el) return
        el.style.transition = 'none'
        el.style.transform  = `translateX(${ALL_CLOUDS[i].idleX})`
      })
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
