'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { useBeanDims } from '@/lib/beanDims'
import type { AvatarConfig } from '@/lib/types'
import { BeanFace } from './BeanFace'

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
        <mesh position={[-r * 0.85, y - r * 0.5, 0]}>
          <boxGeometry args={[r * 0.22, r * 0.7, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 0.85, y - r * 0.5, 0]}>
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
        <mesh position={[-r * 0.85, y - r * 1.0, 0]}>
          <boxGeometry args={[r * 0.22, r * 1.4, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 0.85, y - r * 1.0, 0]}>
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
        <mesh position={[-r * 0.55, y - r * 0.1, r * 0.3]}>
          <sphereGeometry args={[r * 0.35, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 0.55, y - r * 0.1, r * 0.3]}>
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
        <mesh position={[-r * 0.3, y - r * 1.1, 0]}>
          <cylinderGeometry args={[r * 0.14, r * 0.1, r * 1.8, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 0.3, y - r * 1.1, 0]}>
          <cylinderGeometry args={[r * 0.14, r * 0.1, r * 1.8, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  return null
}

function CameraController({ dims }: { dims: ReturnType<typeof useBeanDims> }) {
  const { camera } = useThree()
  useFrame(() => {
    const legBottom = dims.legAttachY - dims.legLen
    const top       = dims.bodyTop + 0.22
    const centerY   = (top + legBottom) / 2
    const height    = top - legBottom
    const targetZ   = Math.max(2.2, (height * 0.5) / Math.tan(20 * Math.PI / 180) * 1.15)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, centerY, 0.1)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1)
    camera.lookAt(0, centerY, 0)
  })
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

  const eyeY   = dims.groundY + dims.capLen * 0.22
  const eyeZ   = dims.radius
  const mouthY = dims.groundY - dims.capLen * 0.05
  const mouthZ = dims.radius

  return (
    <group ref={groupRef}>
      <CameraController dims={dims} />
      {/* Left leg */}
      <group position={[-dims.radius * 0.4 * dims.legSpread, dims.legAttachY, 0]}>
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
      <group position={[dims.radius * 0.4 * dims.legSpread, dims.legAttachY, 0]}>
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

      {/* Body outline */}
      <mesh position={[0, dims.groundY, 0]} scale={1.06}>
        <capsuleGeometry args={[dims.radius, dims.capLen, 8, 16]} />
        <meshBasicMaterial color="black" side={THREE.BackSide} />
      </mesh>

      {/* Body */}
      <mesh position={[0, dims.groundY, 0]}>
        <capsuleGeometry args={[dims.radius, dims.capLen, 8, 16]} />
        <meshToonMaterial color={bodyColor} gradientMap={gradient} />
      </mesh>

      <BeanFace
        eyeStyle={config.eyeStyle ?? 'normal'}
        mouthStyle={config.mouthStyle ?? 'smile'}
        eyeSize={config.eyeSize}
        eyeSpacing={config.eyeSpacing}
        eyeY={eyeY}
        eyeZ={eyeZ}
        mouthY={mouthY}
        mouthZ={mouthZ}
      />

      {/* Left arm — attached to front-left surface */}
      <group position={[-dims.radius * 0.87, dims.armAttachY, dims.radius * 0.5]} rotation={[0, 0, Math.PI * 0.18]}>
        <mesh>
          <sphereGeometry args={[0.065, 8, 8]} />
          <meshToonMaterial color={bodyColor} gradientMap={gradient} />
        </mesh>
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

      {/* Right arm — attached to front-right surface */}
      <group position={[dims.radius * 0.87, dims.armAttachY, dims.radius * 0.5]} rotation={[0, 0, -Math.PI * 0.18]}>
        <mesh>
          <sphereGeometry args={[0.065, 8, 8]} />
          <meshToonMaterial color={bodyColor} gradientMap={gradient} />
        </mesh>
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
    </group>
  )
}

export default function BeanPreview({ config }: { config: AvatarConfig }) {
  return (
    <div style={{ width: 200, height: 200 }}>
      <Canvas camera={{ position: [0, 0.7, 3.4], fov: 40 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={0.8} />
        <BeanScene config={config} />
      </Canvas>
    </div>
  )
}
