'use client'

import type * as THREE from 'three'
import type { AvatarConfig } from '@/lib/types'

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

// Situational face override driven by what's happening to the character in
// the plaza (thrown, knocked out, fuming, snoozing). Undefined = the
// member's chosen avatar face.
export type FaceExpression = 'mad' | 'scared' | 'dazed' | 'sleeping'

interface EyeProps {
  style: AvatarConfig['eyeStyle']
  x: number
  y: number
  z: number
  baseR: number
  pupilR: number
}

// Tiny specular dot that makes pupils read as glossy and alive
function EyeHighlight({ pupilR, z }: { pupilR: number; z: number }) {
  return (
    <mesh position={[pupilR * 0.35, pupilR * 0.35, z + pupilR * 0.55]}>
      <sphereGeometry args={[pupilR * 0.28, 6, 6]} />
      <meshBasicMaterial color="white" />
    </mesh>
  )
}

function BeanEye({ style, x, y, z, baseR, pupilR }: EyeProps) {
  if (style === 'normal') {
    return (
      <group position={[x, y, z]}>
        <mesh><sphereGeometry args={[baseR, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
        <mesh position={[0, 0, baseR * 0.4]}><sphereGeometry args={[pupilR, 6, 6]} /><meshBasicMaterial color="#1a1a1a" /></mesh>
        <EyeHighlight pupilR={pupilR} z={baseR * 0.4} />
      </group>
    )
  }
  if (style === 'happy') {
    return (
      <group position={[x, y, z]} scale={[1, 0.52, 1]}>
        <mesh><sphereGeometry args={[baseR, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
        <mesh position={[0, baseR * 0.25, baseR * 0.4]}><sphereGeometry args={[pupilR * 0.8, 6, 6]} /><meshBasicMaterial color="#1a1a1a" /></mesh>
        <EyeHighlight pupilR={pupilR * 0.8} z={baseR * 0.4} />
      </group>
    )
  }
  if (style === 'cool') {
    return (
      <group position={[x, y, z]}>
        <mesh scale={[1, 0.62, 1]}><sphereGeometry args={[baseR, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
        <mesh position={[0, 0, baseR * 0.3]}>
          <boxGeometry args={[baseR * 1.8, baseR * 0.22, baseR * 0.2]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
      </group>
    )
  }
  if (style === 'sleepy') {
    return (
      <group position={[x, y, z]} scale={[1, 0.38, 1]}>
        <mesh><sphereGeometry args={[baseR, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
        <mesh position={[0, -baseR * 0.1, baseR * 0.4]}><sphereGeometry args={[pupilR, 6, 6]} /><meshBasicMaterial color="#1a1a1a" /></mesh>
      </group>
    )
  }
  if (style === 'star') {
    return (
      <group position={[x, y, z]}>
        <mesh><sphereGeometry args={[baseR, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
        <group position={[0, 0, baseR * 0.42]}>
          <mesh><boxGeometry args={[pupilR * 0.65, pupilR * 2.2, pupilR * 0.35]} /><meshBasicMaterial color="#F5D033" /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[pupilR * 0.65, pupilR * 2.2, pupilR * 0.35]} /><meshBasicMaterial color="#F5D033" /></mesh>
        </group>
      </group>
    )
  }
  if (style === 'heart') {
    return (
      <group position={[x, y, z]}>
        <mesh><sphereGeometry args={[baseR, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
        <mesh position={[0, 0, baseR * 0.42]} scale={[1, 0.68, 1]}>
          <torusGeometry args={[pupilR * 0.65, pupilR * 0.32, 6, 8]} />
          <meshBasicMaterial color="#FF4757" />
        </mesh>
      </group>
    )
  }
  return null
}

// Knocked-out X eye (dazed expression)
function XEye({ x, y, z, baseR }: { x: number; y: number; z: number; baseR: number }) {
  const arm = baseR * 1.5
  const thick = baseR * 0.32
  return (
    <group position={[x, y, z]}>
      <mesh rotation={[0, 0,  Math.PI / 4]}><boxGeometry args={[arm, thick, thick]} /><meshBasicMaterial color="#1a1a1a" /></mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}><boxGeometry args={[arm, thick, thick]} /><meshBasicMaterial color="#1a1a1a" /></mesh>
    </group>
  )
}

interface MouthProps {
  style: AvatarConfig['mouthStyle'] | 'frown' | 'o' | 'small_smile'
  y: number
  z: number
}

function BeanMouth({ style, y, z }: MouthProps) {
  if (style === 'smile') {
    return (
      <mesh position={[0, y, z]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.055, 0.014, 8, 12, Math.PI]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  if (style === 'grin') {
    return (
      <mesh position={[0, y + 0.006, z]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.075, 0.013, 8, 14, Math.PI * 1.1]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  if (style === 'neutral') {
    return (
      <mesh position={[0, y, z]}>
        <boxGeometry args={[0.10, 0.013, 0.012]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  if (style === 'smirk') {
    return (
      <mesh position={[0.022, y - 0.01, z]} rotation={[0, 0, Math.PI + 0.32]}>
        <torusGeometry args={[0.045, 0.013, 8, 10, Math.PI * 0.7]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  if (style === 'frown') {
    return (
      <mesh position={[0, y - 0.015, z]}>
        <torusGeometry args={[0.05, 0.014, 8, 12, Math.PI]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  if (style === 'o') {
    return (
      <mesh position={[0, y, z]}>
        <torusGeometry args={[0.035, 0.015, 8, 12]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  if (style === 'small_smile') {
    return (
      <mesh position={[0, y, z]} rotation={[0, 0, Math.PI]} scale={0.7}>
        <torusGeometry args={[0.055, 0.014, 8, 12, Math.PI]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>
    )
  }
  return null
}

export interface BeanFaceProps {
  eyeStyle: AvatarConfig['eyeStyle']
  mouthStyle: AvatarConfig['mouthStyle']
  eyeSize?: number
  eyeSpacing?: number
  eyeY: number
  eyeZ: number
  mouthY: number
  mouthZ: number
  expression?: FaceExpression
  // The eyes live in this group so a parent can animate blinks (scale.y)
  eyesRef?: React.Ref<THREE.Group>
}

export function BeanFace({
  eyeStyle, mouthStyle,
  eyeSize = 0.5, eyeSpacing = 0.5,
  eyeY, eyeZ, mouthY, mouthZ,
  expression, eyesRef,
}: BeanFaceProps) {
  const baseR  = lerp(0.035, 0.12, eyeSize)
  const pupilR = baseR * 0.58
  const spread = lerp(0.07, 0.28, eyeSpacing)

  const effEyeStyle: AvatarConfig['eyeStyle'] =
    expression === 'sleeping' ? 'sleepy' : eyeStyle
  const effEyeR = expression === 'scared' ? baseR * 1.25 : baseR
  const effMouth: MouthProps['style'] =
    expression === 'mad'      ? 'frown' :
    expression === 'scared'   ? 'o' :
    expression === 'dazed'    ? 'o' :
    expression === 'sleeping' ? 'small_smile' :
    mouthStyle

  return (
    <>
      <group ref={eyesRef} position={[0, eyeY, 0]}>
        {expression === 'dazed' ? (
          <>
            <XEye x={-spread} y={0} z={eyeZ} baseR={baseR} />
            <XEye x={ spread} y={0} z={eyeZ} baseR={baseR} />
          </>
        ) : (
          <>
            <BeanEye style={effEyeStyle} x={-spread} y={0} z={eyeZ} baseR={effEyeR} pupilR={pupilR} />
            <BeanEye style={effEyeStyle} x={ spread} y={0} z={eyeZ} baseR={effEyeR} pupilR={pupilR} />
          </>
        )}
      </group>

      {/* Angry brows sit outside the blink group so they don't squash */}
      {expression === 'mad' && (
        <>
          <mesh position={[-spread, eyeY + baseR * 1.15, eyeZ + baseR * 0.2]} rotation={[0, 0, -0.55]}>
            <boxGeometry args={[baseR * 2.1, baseR * 0.42, baseR * 0.3]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[ spread, eyeY + baseR * 1.15, eyeZ + baseR * 0.2]} rotation={[0, 0, 0.55]}>
            <boxGeometry args={[baseR * 2.1, baseR * 0.42, baseR * 0.3]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
        </>
      )}

      <BeanMouth style={effMouth} y={mouthY} z={mouthZ} />
    </>
  )
}
