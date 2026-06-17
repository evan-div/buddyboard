'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { useBeanDims } from '@/lib/beanDims'
import type { BeanDims } from '@/lib/beanDims'
import type { AvatarConfig } from '@/lib/types'

function BeanBody({ dims, color, gradient }: {
  dims: BeanDims
  color: string
  gradient: THREE.DataTexture
}) {
  const r  = dims.radius
  const cl = dims.capLen
  const gY = dims.groundY
  const shape = dims.shape ?? 'bean'

  const fillMat    = <meshToonMaterial color={color} gradientMap={gradient} />
  const outlineMat = <meshBasicMaterial color="black" side={THREE.BackSide} />

  if (shape === 'peanut') {
    const botR   = r
    const botY   = gY - cl * 0.06
    const topR   = r * 0.72
    const topY   = gY + cl * 0.60
    const waistR = r * 0.30
    const waistH = Math.max(0.04, (topY - topR) - (botY + botR))
    const waistY = (topY - topR + botY + botR) / 2
    return (
      <>
        <mesh position={[0, botY, 0]} scale={1.06}><sphereGeometry args={[botR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, botY, 0]}><sphereGeometry args={[botR, 12, 12]} />{fillMat}</mesh>
        <mesh position={[0, waistY, 0]} scale={1.08}><cylinderGeometry args={[waistR, waistR, waistH + 0.06, 12]} />{outlineMat}</mesh>
        <mesh position={[0, waistY, 0]}><cylinderGeometry args={[waistR, waistR, waistH + 0.06, 12]} />{fillMat}</mesh>
        <mesh position={[0, topY, 0]} scale={1.06}><sphereGeometry args={[topR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, topY, 0]}><sphereGeometry args={[topR, 12, 12]} />{fillMat}</mesh>
      </>
    )
  }

  if (shape === 'gourd') {
    const botR  = r * 1.18
    const botY  = gY + cl * 0.02
    const topR  = r * 0.60
    const topY  = gY + cl * 0.70
    const neckR = r * 0.52
    const neckH = Math.max(0.04, (topY - topR * 0.5) - (botY + botR * 0.55))
    const neckY = (topY - topR * 0.5 + botY + botR * 0.55) / 2
    return (
      <>
        <mesh position={[0, botY, 0]} scale={1.05}><sphereGeometry args={[botR, 14, 14]} />{outlineMat}</mesh>
        <mesh position={[0, botY, 0]}><sphereGeometry args={[botR, 14, 14]} />{fillMat}</mesh>
        <mesh position={[0, neckY, 0]} scale={1.08}><cylinderGeometry args={[neckR, botR * 0.62, neckH, 12]} />{outlineMat}</mesh>
        <mesh position={[0, neckY, 0]}><cylinderGeometry args={[neckR, botR * 0.62, neckH, 12]} />{fillMat}</mesh>
        <mesh position={[0, topY, 0]} scale={1.08}><sphereGeometry args={[topR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, topY, 0]}><sphereGeometry args={[topR, 12, 12]} />{fillMat}</mesh>
      </>
    )
  }

  if (shape === 'strawberry') {
    const topR    = r * 1.12
    const topY    = gY + cl * 0.42
    const coneBot = gY - cl * 0.08
    const coneH   = Math.max(0.04, topY - topR * 0.55 - coneBot)
    const coneTopR = r * 0.36
    const coneBotR = r * 0.22
    const coneY    = coneBot + coneH / 2
    return (
      <>
        <mesh position={[0, coneY, 0]} scale={1.07}><cylinderGeometry args={[coneTopR, coneBotR, coneH, 12]} />{outlineMat}</mesh>
        <mesh position={[0, coneY, 0]}><cylinderGeometry args={[coneTopR, coneBotR, coneH, 12]} />{fillMat}</mesh>
        <mesh position={[0, topY, 0]} scale={1.06}><sphereGeometry args={[topR, 14, 14]} />{outlineMat}</mesh>
        <mesh position={[0, topY, 0]}><sphereGeometry args={[topR, 14, 14]} />{fillMat}</mesh>
      </>
    )
  }

  // bean (capsule)
  return (
    <>
      <mesh position={[0, gY, 0]} scale={1.06}><capsuleGeometry args={[r, cl, 8, 16]} />{outlineMat}</mesh>
      <mesh position={[0, gY, 0]}><capsuleGeometry args={[r, cl, 8, 16]} />{fillMat}</mesh>
    </>
  )
}

function useGradient() {
  return useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([80, 140, 230]), 3, 1, THREE.RedFormat)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }, [])
}

function BeanHair({ style, color, bodyTop, radius }: {
  style: AvatarConfig['hairStyle']
  color: string
  bodyTop: number
  radius: number
}) {
  if (style === 'bald') return null
  const r = radius
  const y = bodyTop

  if (style === 'short' || style === 'wavy') {
    return (
      <mesh position={[0, y, 0]}>
        <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'medium') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 1.1, y - r * 0.5, 0]}>
          <boxGeometry args={[r * 0.22, r * 0.7, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 1.1, y - r * 0.5, 0]}>
          <boxGeometry args={[r * 0.22, r * 0.7, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'long') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 1.1, y - r * 1.0, 0]}>
          <boxGeometry args={[r * 0.22, r * 1.4, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 1.1, y - r * 1.0, 0]}>
          <boxGeometry args={[r * 0.22, r * 1.4, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'curly') {
    return (
      <group>
        <mesh position={[0, y + r * 0.1, 0]}>
          <sphereGeometry args={[r * 0.82, 10, 10]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 1.0, y - r * 0.1, 0]}>
          <sphereGeometry args={[r * 0.35, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 1.0, y - r * 0.1, 0]}>
          <sphereGeometry args={[r * 0.35, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'mohawk') {
    return (
      <mesh position={[0, y + r * 0.35, 0]}>
        <boxGeometry args={[r * 0.28, r * 0.85, r * 0.75]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'ponytail') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, y - r * 0.3, -r * 0.85]}>
          <sphereGeometry args={[r * 0.38, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'bun') {
    return (
      <mesh position={[0, y + r * 0.12, 0]}>
        <sphereGeometry args={[r * 0.42, 10, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'topknot') {
    return (
      <mesh position={[0, y + r * 0.3, 0]} scale={[1, 2.2, 1]}>
        <sphereGeometry args={[r * 0.28, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'afro') {
    return (
      <mesh position={[0, y + r * 0.1, 0]}>
        <sphereGeometry args={[r * 0.78, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'braids') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 0.95, y - r * 1.1, 0]}>
          <cylinderGeometry args={[r * 0.14, r * 0.1, r * 1.8, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 0.95, y - r * 1.1, 0]}>
          <cylinderGeometry args={[r * 0.14, r * 0.1, r * 1.8, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  return null
}

function BeanAccessory({ style, bodyTop, radius, eyeY, eyeZ, eyeSpread }: {
  style: AvatarConfig['accessory']
  bodyTop: number
  radius: number
  eyeY: number
  eyeZ: number
  eyeSpread: number
}) {
  if (style === 'none') return null
  const r = radius

  if (style === 'glasses') {
    const bridge = Math.max(0.01, eyeSpread * 2 - 0.108)
    return (
      <group position={[0, eyeY, eyeZ + 0.01]}>
        <mesh position={[-eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#444" />
        </mesh>
        <mesh position={[eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#444" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.007, 0.007, bridge, 6]} />
          <meshStandardMaterial color="#444" />
        </mesh>
      </group>
    )
  }
  if (style === 'sunglasses') {
    return (
      <group position={[0, eyeY, eyeZ + 0.01]}>
        <mesh position={[-eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[-eyeSpread, 0, 0.006]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial color="#111" transparent opacity={0.9} />
        </mesh>
        <mesh position={[eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[eyeSpread, 0, 0.006]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial color="#111" transparent opacity={0.9} />
        </mesh>
      </group>
    )
  }
  if (style === 'monocle') {
    return (
      <group position={[eyeSpread, eyeY, eyeZ + 0.01]}>
        <mesh>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#C0A040" />
        </mesh>
        <mesh position={[0, 0, 0.006]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial color="#88AACC" transparent opacity={0.5} />
        </mesh>
      </group>
    )
  }
  if (style === 'hat') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh><cylinderGeometry args={[r * 1.1, r * 1.1, 0.06, 16]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[r * 0.72, r * 0.78, 0.28, 16]} /><meshStandardMaterial color="#222" /></mesh>
      </group>
    )
  }
  if (style === 'crown') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh><cylinderGeometry args={[r * 0.85, r * 0.85, 0.08, 16]} /><meshStandardMaterial color="#F5D033" /></mesh>
        {[0, 1, 2, 3, 4].map(i => {
          const a = (i / 5) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.sin(a) * r * 0.75, 0.13, Math.cos(a) * r * 0.75]}>
              <coneGeometry args={[0.06, 0.17, 6]} />
              <meshStandardMaterial color="#F5D033" />
            </mesh>
          )
        })}
      </group>
    )
  }
  if (style === 'wizard_hat') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh><cylinderGeometry args={[r * 1.0, r * 1.0, 0.05, 16]} /><meshStandardMaterial color="#4B0082" /></mesh>
        <mesh position={[0, 0.32, 0]}><coneGeometry args={[r * 0.82, 0.6, 16]} /><meshStandardMaterial color="#4B0082" /></mesh>
        <mesh position={[0, 0.14, 0]}><torusGeometry args={[r * 0.7, 0.04, 8, 16]} /><meshStandardMaterial color="#FFD700" /></mesh>
      </group>
    )
  }
  if (style === 'headband') {
    return (
      <mesh position={[0, bodyTop - r * 0.8, 0]} rotation={[0.25, 0, 0]}>
        <torusGeometry args={[r * 0.98, 0.038, 8, 32, Math.PI]} />
        <meshStandardMaterial color="#EC4899" />
      </mesh>
    )
  }
  if (style === 'bunny_ears') {
    return (
      <group position={[0, bodyTop + 0.05, 0]}>
        <mesh position={[-r * 0.45, 0.28, 0]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="white" />
        </mesh>
        <mesh position={[r * 0.45, 0.28, 0]} rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="white" />
        </mesh>
        <mesh position={[-r * 0.45, 0.28, 0]} rotation={[0, 0, -0.2]} scale={[0.5, 0.88, 0.4]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="#FFB3C1" />
        </mesh>
        <mesh position={[r * 0.45, 0.28, 0]} rotation={[0, 0, 0.2]} scale={[0.5, 0.88, 0.4]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="#FFB3C1" />
        </mesh>
      </group>
    )
  }
  if (style === 'horns') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh position={[-r * 0.48, 0.12, 0]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[r * 0.22, 0.24, 8]} />
          <meshStandardMaterial color="#CC2200" />
        </mesh>
        <mesh position={[r * 0.48, 0.12, 0]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[r * 0.22, 0.24, 8]} />
          <meshStandardMaterial color="#CC2200" />
        </mesh>
      </group>
    )
  }
  if (style === 'halo') {
    return (
      <mesh position={[0, bodyTop + 0.28, 0]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[r * 0.72, 0.04, 8, 24]} />
        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.4} />
      </mesh>
    )
  }
  if (style === 'flower_crown') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        {[0, 1, 2, 3, 4, 5].map(i => {
          const a = (i / 6) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.sin(a) * r * 0.9, 0.06, Math.cos(a) * r * 0.9]}>
              <sphereGeometry args={[r * 0.22, 8, 8]} />
              <meshStandardMaterial color={['#FF6B9D', '#FF4757', '#FFA502', '#2ED573', '#7BED9F', '#5352ED'][i]} />
            </mesh>
          )
        })}
      </group>
    )
  }
  return null
}

function BeanScene({ config }: { config: AvatarConfig }) {
  const groupRef  = useRef<THREE.Group>(null)
  const dims      = useBeanDims(config)
  const gradient  = useGradient()
  const skinColor = SKIN_TONES[config.skinTone]
  const bodyColor = config.bodyColor ?? config.shirtColor

  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 0.6
  })

  const eyeY      = dims.faceCenterY
  const eyeZ      = dims.faceZ
  const eyeSpread = Math.min(0.12, dims.faceZ * 0.42)
  const mouthY    = dims.faceCenterY - dims.faceZ * 0.38
  const mouthZ    = dims.faceZ

  return (
    <group ref={groupRef}>
      {/* Left leg */}
      <group position={[-dims.radius * 0.4, dims.legAttachY, 0]}>
        <mesh position={[0, -dims.legLen / 2, 0]} scale={1.1}>
          <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
          <meshBasicMaterial color="black" side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, -dims.legLen / 2, 0]}>
          <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
          <meshToonMaterial color={config.pantsColor} gradientMap={gradient} />
        </mesh>
        <mesh position={[0, -dims.legLen - 0.04, 0.03]}>
          <sphereGeometry args={[0.068, 8, 8]} />
          <meshToonMaterial color={config.shoesColor} gradientMap={gradient} />
        </mesh>
      </group>

      {/* Right leg */}
      <group position={[dims.radius * 0.4, dims.legAttachY, 0]}>
        <mesh position={[0, -dims.legLen / 2, 0]} scale={1.1}>
          <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
          <meshBasicMaterial color="black" side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, -dims.legLen / 2, 0]}>
          <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
          <meshToonMaterial color={config.pantsColor} gradientMap={gradient} />
        </mesh>
        <mesh position={[0, -dims.legLen - 0.04, 0.03]}>
          <sphereGeometry args={[0.068, 8, 8]} />
          <meshToonMaterial color={config.shoesColor} gradientMap={gradient} />
        </mesh>
      </group>

      {/* Body */}
      <BeanBody dims={dims} color={bodyColor} gradient={gradient} />

      {/* Eyes */}
      <mesh position={[-eyeSpread, eyeY, eyeZ]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[-eyeSpread, eyeY, eyeZ + 0.02]}>
        <sphereGeometry args={[0.032, 6, 6]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[eyeSpread, eyeY, eyeZ]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[eyeSpread, eyeY, eyeZ + 0.02]}>
        <sphereGeometry args={[0.032, 6, 6]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>

      {/* Mouth */}
      <mesh position={[0, mouthY, mouthZ]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.055, 0.014, 8, 12, Math.PI]} />
        <meshBasicMaterial color="#2a1010" />
      </mesh>

      {/* Left arm — rotated outward (-Z) so it angles away from body */}
      <group position={[-dims.armX, dims.armAttachY, 0]} rotation={[0, 0, -Math.PI * 0.15]}>
        <mesh position={[0, -dims.armLen / 2, 0]} scale={1.1}>
          <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
          <meshBasicMaterial color="black" side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, -dims.armLen / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
          <meshToonMaterial color={bodyColor} gradientMap={gradient} />
        </mesh>
        <mesh position={[0, -(dims.armLen + 0.04), 0]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshToonMaterial color={skinColor} gradientMap={gradient} />
        </mesh>
      </group>

      {/* Right arm — rotated outward (+Z) */}
      <group position={[dims.armX, dims.armAttachY, 0]} rotation={[0, 0, Math.PI * 0.15]}>
        <mesh position={[0, -dims.armLen / 2, 0]} scale={1.1}>
          <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
          <meshBasicMaterial color="black" side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, -dims.armLen / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
          <meshToonMaterial color={bodyColor} gradientMap={gradient} />
        </mesh>
        <mesh position={[0, -(dims.armLen + 0.04), 0]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshToonMaterial color={skinColor} gradientMap={gradient} />
        </mesh>
      </group>

      {/* Hair */}
      <BeanHair
        style={config.hairStyle}
        color={config.hairColor}
        bodyTop={dims.bodyTop}
        radius={dims.radius}
      />

      {/* Accessory */}
      <BeanAccessory
        style={config.accessory}
        bodyTop={dims.bodyTop}
        radius={dims.radius}
        eyeY={eyeY}
        eyeZ={eyeZ}
        eyeSpread={eyeSpread}
      />
    </group>
  )
}

export default function BeanPreview({ config }: { config: AvatarConfig }) {
  return (
    <div style={{ width: 140, height: 140 }}>
      <Canvas camera={{ position: [0, 0.85, 3.4], fov: 40 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={0.8} />
        <BeanScene config={config} />
      </Canvas>
    </div>
  )
}
