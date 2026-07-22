import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FSIZE, plazaEdgeRadius } from './plazaMath'

// Mobile-first interpretation of cortiz2894/stylized-components' GrassField:
// keep Buddyboard's procedural island, but use tapered instanced blades, shared
// grass/dirt masks, color variation, and world-space wind. The implementation is
// intentionally self-contained so the Plaza does not need the demo's GLB or Leva.

// Each instance is a two-blade crossed cluster. The denser mobile field remains
// inexpensive while putting enough separate roots on screen to read as a lawn.
const MOBILE_CLUSTERS = 38_000 // 76k visible blades / 228k triangles
const DESKTOP_CLUSTERS = 52_000 // 104k visible blades / 312k triangles
const MAX_INTERACTORS = 10
const INTERACTOR_RADIUS = 0.38
const INTERACTOR_FALLOFF = 0.46
const PATCH_W = FSIZE / 10

const FIELD_NOISE_GLSL = /* glsl */ `
  float fieldHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float fieldNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(fieldHash(i), fieldHash(i + vec2(1.0, 0.0)), f.x),
      mix(fieldHash(i + vec2(0.0, 1.0)), fieldHash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fieldFbm(vec2 p) {
    float value = 0.0;
    value += fieldNoise(p) * 0.58;
    value += fieldNoise(p * 2.03 + 7.1) * 0.28;
    value += fieldNoise(p * 4.01 - 3.7) * 0.14;
    return value;
  }

  float fieldDirt(vec2 worldXZ) {
    float warped = fieldFbm(worldXZ * 0.16 + vec2(2.4, -1.7));
    return smoothstep(0.66, 0.77, warped);
  }

  float fieldLongGrass(vec2 worldXZ) {
    float meadow = fieldFbm(worldXZ * 0.075 + vec2(-6.8, 4.1));
    float edgeVariation = fieldNoise(worldXZ * 0.22 + vec2(3.7, -8.2));
    return smoothstep(0.58, 0.70, meadow) * mix(0.82, 1.0, edgeVariation);
  }
`

function makePlazaShape(): THREE.Shape {
  const points: THREE.Vector2[] = []
  for (let i = 0; i < 96; i++) {
    const theta = (i / 96) * Math.PI * 2
    const radius = plazaEdgeRadius(theta)
    points.push(new THREE.Vector2(Math.cos(theta) * radius, Math.sin(theta) * radius))
  }
  return new THREE.Shape(points)
}

function makeBladeGeometry(): THREE.BufferGeometry {
  // Two slightly mismatched tapered blades cross at 90 degrees. A cluster reads
  // as grass even when one blade is edge-on, and its six triangles are still a
  // predictable mobile budget.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    // Blade A — X-facing, full height
    -0.50, 0.00, -0.02,
     0.50, 0.00, -0.02,
    -0.34, 0.48, -0.02,
     0.34, 0.48, -0.02,
     0.00, 1.00, -0.02,
    // Blade B — Z-facing, offset and a little shorter
     0.02, 0.00, -0.46,
     0.02, 0.00,  0.46,
     0.02, 0.44, -0.31,
     0.02, 0.44,  0.31,
     0.02, 0.90,  0.00,
  ], 3))
  geometry.setIndex([
    0, 1, 2,
    1, 3, 2,
    2, 3, 4,
    5, 6, 7,
    6, 8, 7,
    7, 8, 9,
  ])
  geometry.computeVertexNormals()
  return geometry
}

function seededRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) | 0
    return (state >>> 0) / 4294967296
  }
}

function makeJitteredPositions(count: number, seed: number): [number, number][] {
  const span = FSIZE * 1.06
  let gridSize = Math.ceil(Math.sqrt(count / 0.8))

  // A jittered cell per root avoids the clumps and empty streaks produced by
  // pure random sampling. Retry with one extra row if edge clipping leaves us
  // a few positions short, then shuffle before trimming to keep every side even.
  while (true) {
    const random = seededRandom(seed + gridSize)
    const cellSize = span / gridSize
    const positions: [number, number][] = []

    for (let row = 0; row < gridSize; row++) {
      for (let column = 0; column < gridSize; column++) {
        const x = -span / 2 + (column + 0.5 + (random() - 0.5) * 0.88) * cellSize
        const z = -span / 2 + (row + 0.5 + (random() - 0.5) * 0.88) * cellSize
        const theta = Math.atan2(z, x)
        if (Math.hypot(x, z) <= plazaEdgeRadius(theta) - 0.08) {
          positions.push([x, z])
        }
      }
    }

    if (positions.length >= count) {
      for (let i = positions.length - 1; i > 0; i--) {
        const swapIndex = Math.floor(random() * (i + 1))
        const current = positions[i]
        positions[i] = positions[swapIndex]
        positions[swapIndex] = current
      }
      return positions.slice(0, count)
    }

    gridSize++
  }
}

function makeBladeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 0.075 },
      uWindDir: { value: new THREE.Vector2(-0.82, -0.57).normalize() },
      uGrassBottom: { value: new THREE.Color('#315f25') },
      uGrassTop: { value: new THREE.Color('#74b83f') },
      uGrassDry: { value: new THREE.Color('#a69843') },
      uDirtColor: { value: new THREE.Color('#8f6a42') },
      uSunDir: { value: new THREE.Vector3(-0.48, 0.76, -0.44).normalize() },
      uTransColor: { value: new THREE.Color('#c6df63') },
      uTransStrength: { value: 0.34 },
      uInteractorCount: { value: 0 },
      uInteractors: {
        value: Array.from({ length: MAX_INTERACTORS }, () => new THREE.Vector4()),
      },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec2 uWindDir;
      uniform int uInteractorCount;
      uniform vec4 uInteractors[${MAX_INTERACTORS}];
      varying float vBladeHeight;
      varying float vPatch;
      varying float vDirt;
      varying float vDirtCore;
      varying float vLongGrass;
      varying vec3 vWorldPosition;
      varying vec3 vBladeNormal;
      ${FIELD_NOISE_GLSL}

      void main() {
        vec3 localPosition = position;
        vec3 bladeBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vBladeHeight = position.y;
        vDirt = fieldDirt(bladeBase.xz);
        vDirtCore = smoothstep(0.58, 0.92, vDirt);
        vPatch = fieldFbm(bladeBase.xz * 0.105 - vec2(4.2, 1.3));
        vLongGrass = fieldLongGrass(bladeBase.xz);

        // Visible, grounded Miis are soft influence discs. The strongest nearby
        // character wins so overlapping groups never crush the grass twice.
        float characterInfluence = 0.0;
        vec2 characterAway = vec2(1.0, 0.0);
        for (int i = 0; i < ${MAX_INTERACTORS}; i++) {
          if (i >= uInteractorCount) break;
          vec4 interactor = uInteractors[i];
          vec2 offset = bladeBase.xz - interactor.xy;
          float distanceToCharacter = length(offset);
          float influence = (1.0 - smoothstep(
            interactor.z,
            interactor.z + ${INTERACTOR_FALLOFF.toFixed(2)},
            distanceToCharacter
          )) * interactor.w;
          if (influence > characterInfluence) {
            characterInfluence = influence;
            characterAway = distanceToCharacter > 0.0001
              ? offset / distanceToCharacter
              : vec2(1.0, 0.0);
          }
        }

        // The broad dirt edge becomes short green turf first; only the core is
        // pressed down to brown stubble. Character trampling composes last so it
        // remains visible even in the tallest meadow patches.
        float wearHeight = mix(1.0, 0.42, vDirt);
        wearHeight = mix(wearHeight, 0.14, vDirtCore);
        localPosition.y *= mix(1.0, 1.60, vLongGrass)
          * wearHeight
          * mix(1.0, 0.30, characterInfluence);

        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(localPosition, 1.0);
        float gust = sin(uTime * 1.20 + dot(bladeBase.xz, vec2(0.38, 0.27)));
        gust += sin(uTime * 2.05 + dot(bladeBase.xz, vec2(-0.13, 0.51))) * 0.38;
        float bend = pow(position.y, 1.55) * gust * uWindStrength * mix(1.0, 1.22, vLongGrass);
        worldPosition.xz += uWindDir * bend;

        // Long-grass regions share a slowly changing lean direction, so they
        // read as coherent meadow swaths rather than individually tall blades.
        float sweep = fieldNoise(bladeBase.xz * 0.045 + vec2(9.4, -3.2));
        vec2 meadowPerp = vec2(-uWindDir.y, uWindDir.x);
        vec2 meadowDir = normalize(uWindDir + meadowPerp * ((sweep - 0.5) * 0.85));
        worldPosition.xz += meadowDir * pow(position.y, 1.45) * vLongGrass * 0.075;

        // Pressed blades also splay away from the character instead of merely
        // scaling down, which gives the contact patch a physical rim.
        worldPosition.xz += characterAway
          * pow(position.y, 1.35)
          * characterInfluence
          * 0.13;

        mat3 instanceRotation = mat3(
          normalize(vec3(instanceMatrix[0])),
          normalize(vec3(instanceMatrix[1])),
          normalize(vec3(instanceMatrix[2]))
        );
        vBladeNormal = normalize(mat3(modelMatrix) * instanceRotation * normal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGrassBottom;
      uniform vec3 uGrassTop;
      uniform vec3 uGrassDry;
      uniform vec3 uDirtColor;
      uniform vec3 uSunDir;
      uniform vec3 uTransColor;
      uniform float uTransStrength;
      varying float vBladeHeight;
      varying float vPatch;
      varying float vDirt;
      varying float vDirtCore;
      varying float vLongGrass;
      varying vec3 vWorldPosition;
      varying vec3 vBladeNormal;

      void main() {
        float gradient = smoothstep(0.05, 0.96, vBladeHeight);
        vec3 grass = mix(uGrassBottom, uGrassTop, gradient);
        float dryMix = smoothstep(0.49, 0.78, vPatch) * 0.42;
        grass = mix(grass, uGrassDry, dryMix);

        // Separate shortening from browning: green turf at the outer edge,
        // warm stubble through the transition, and earth color only at the core.
        float tanStubble = smoothstep(0.28, 0.78, vDirt) * (1.0 - vDirtCore);
        grass = mix(grass, uGrassDry, tanStubble * 0.42);
        grass = mix(grass, uDirtColor, vDirtCore * 0.82);
        grass *= mix(vec3(1.0), vec3(0.88, 0.96, 0.84), vLongGrass * 0.22);

        // Stable base lighting prevents random blade rotation from sparkling.
        // The true blade normal is reserved for directional, tip-biased light
        // transmission when the viewer looks toward the art-directed sun.
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 sunDir = normalize(uSunDir);
        float backlit = pow(max(dot(viewDir, -sunDir), 0.0), 4.5);
        float edgeOn = 1.0 - abs(dot(normalize(vBladeNormal), sunDir));
        float tipTransmission = pow(gradient, 2.2);
        vec3 transmission = uTransColor * uTransStrength * backlit * edgeOn * tipTransmission;

        gl_FragColor = vec4(grass * 0.94 + transmission, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function fieldHash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function fieldNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  let fx = x - ix, fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = THREE.MathUtils.lerp(fieldHash(ix, iy), fieldHash(ix + 1, iy), fx)
  const b = THREE.MathUtils.lerp(fieldHash(ix, iy + 1), fieldHash(ix + 1, iy + 1), fx)
  return THREE.MathUtils.lerp(a, b, fy)
}

function fieldFbm(x: number, y: number): number {
  return fieldNoise(x, y) * 0.58
    + fieldNoise(x * 2.03 + 7.1, y * 2.03 + 7.1) * 0.28
    + fieldNoise(x * 4.01 - 3.7, y * 4.01 - 3.7) * 0.14
}

function makeGroundTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const image = context.createImageData(size, size)
  const light = new THREE.Color('#4c8b31')
  const dark = new THREE.Color('#315f25')
  const dry = new THREE.Color('#a89343')
  const dirt = new THREE.Color('#8f6a42')
  const grass = new THREE.Color()
  const dirtVar = new THREE.Color()
  const displayColor = new THREE.Color()

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const worldX = (px / (size - 1) - 0.5) * FSIZE
      const worldZ = (py / (size - 1) - 0.5) * FSIZE
      const checker = (Math.floor((worldX + FSIZE / 2) / PATCH_W)
        + Math.floor((worldZ + FSIZE / 2) / PATCH_W)) & 1
      grass.copy(dark).lerp(light, checker * 0.25)

      const patch = fieldFbm(worldX * 0.105 - 4.2, worldZ * 0.105 - 1.3)
      grass.lerp(dry, smoothstep(0.49, 0.78, patch) * 0.32)
      const dirtMask = smoothstep(0.66, 0.77, fieldFbm(worldX * 0.16 + 2.4, worldZ * 0.16 - 1.7))
      const variation = THREE.MathUtils.lerp(0.82, 1.15, fieldNoise(worldX * 2.6, worldZ * 2.6))
      dirtVar.copy(dirt).multiplyScalar(variation)
      grass.lerp(dirtVar, dirtMask)
      displayColor.copy(grass).convertLinearToSRGB()

      const offset = (py * size + px) * 4
      image.data[offset] = Math.round(THREE.MathUtils.clamp(displayColor.r, 0, 1) * 255)
      image.data[offset + 1] = Math.round(THREE.MathUtils.clamp(displayColor.g, 0, 1) * 255)
      image.data[offset + 2] = Math.round(THREE.MathUtils.clamp(displayColor.b, 0, 1) * 255)
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1 / FSIZE, 1 / FSIZE)
  texture.offset.set(0.5, 0.5)
  return texture
}

export default function StylizedGrassSurface({
  mobile,
  reducedMotion,
  characterGroups,
}: {
  mobile: boolean
  reducedMotion: boolean
  characterGroups?: RefObject<Map<string, THREE.Group>>
}) {
  const clusterCount = mobile ? MOBILE_CLUSTERS : DESKTOP_CLUSTERS
  const bladesRef = useRef<THREE.InstancedMesh>(null)
  const plazaShape = useMemo(() => makePlazaShape(), [])
  const groundGeometry = useMemo(() => new THREE.ShapeGeometry(plazaShape), [plazaShape])
  const bladeGeometry = useMemo(() => makeBladeGeometry(), [])
  const bladeMaterial = useMemo(() => makeBladeMaterial(), [])
  const groundTexture = useMemo(() => makeGroundTexture(), [])
  const interactorCandidates = useRef<THREE.Group[]>([])

  useEffect(() => {
    const mesh = bladesRef.current
    if (!mesh) return

    const seed = 0x62756464 + (mobile ? 1 : 0)
    const random = seededRandom(seed ^ 0x47726173)
    const positions = makeJitteredPositions(clusterCount, seed)
    const dummy = new THREE.Object3D()
    positions.forEach(([x, z], placed) => {
      const height = 0.175 + random() * 0.08
      const width = 0.046 + random() * 0.024
      dummy.position.set(x, 0.006, z)
      dummy.rotation.set(0, random() * Math.PI * 2, 0)
      dummy.scale.set(width, height, width)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [clusterCount, mobile])

  useFrame(({ camera }, delta) => {
    const candidates = interactorCandidates.current
    candidates.length = 0
    if (characterGroups?.current) {
      for (const group of characterGroups.current.values()) {
        if (group.visible && group.position.y < 1.05) candidates.push(group)
      }
      candidates.sort((a, b) =>
        a.position.distanceToSquared(camera.position)
        - b.position.distanceToSquared(camera.position))
    }

    const slots = bladeMaterial.uniforms.uInteractors.value as THREE.Vector4[]
    const count = Math.min(candidates.length, MAX_INTERACTORS)
    for (let i = 0; i < count; i++) {
      const group = candidates[i]
      const groundedStrength = THREE.MathUtils.clamp(1 - Math.max(0, group.position.y) / 1.05, 0, 1)
      slots[i].set(group.position.x, group.position.z, INTERACTOR_RADIUS, groundedStrength)
    }
    bladeMaterial.uniforms.uInteractorCount.value = count

    if (!reducedMotion) {
      bladeMaterial.uniforms.uTime.value =
        (bladeMaterial.uniforms.uTime.value + Math.min(delta, 0.1)) % 3600
    }
  })

  return (
    <>
      <mesh
        geometry={groundGeometry}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
      >
        <meshBasicMaterial map={groundTexture} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh
        ref={bladesRef}
        args={[bladeGeometry, bladeMaterial, clusterCount]}
        frustumCulled={false}
      />
    </>
  )
}
