import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FSIZE, plazaEdgeRadius } from './plazaMath'

// Mobile-first interpretation of cortiz2894/stylized-components' GrassField:
// keep Buddyboard's procedural island, but use tapered instanced blades, shared
// grass/dirt masks, color variation, and world-space wind. The implementation is
// intentionally self-contained so the Plaza does not need the demo's GLB or Leva.

const MOBILE_BLADES = 28_000
const DESKTOP_BLADES = 46_000
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
    return smoothstep(0.61, 0.72, warped);
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
  // Three joined triangles give the blade a tapered, bendable silhouette while
  // staying below the triangle budget of the old ~100k one-triangle field.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0.00, 0,
     0.5, 0.00, 0,
    -0.34, 0.48, 0,
     0.34, 0.48, 0,
     0.00, 1.00, 0,
  ], 3))
  geometry.setIndex([
    0, 1, 2,
    1, 3, 2,
    2, 3, 4,
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

function makeBladeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 0.075 },
      uWindDir: { value: new THREE.Vector2(-0.82, -0.57).normalize() },
      uGrassBottom: { value: new THREE.Color('#315f25') },
      uGrassTop: { value: new THREE.Color('#86c947') },
      uGrassDry: { value: new THREE.Color('#b9a64a') },
      uDirtColor: { value: new THREE.Color('#8f6a42') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec2 uWindDir;
      varying float vBladeHeight;
      varying float vPatch;
      varying float vDirt;
      varying float vLight;
      ${FIELD_NOISE_GLSL}

      void main() {
        vec3 localPosition = position;
        vec3 bladeBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vBladeHeight = position.y;
        vDirt = fieldDirt(bladeBase.xz);
        vPatch = fieldFbm(bladeBase.xz * 0.105 - vec2(4.2, 1.3));

        // Dirt is a shared GPU mask: the ground turns earthy while blades in
        // the same patch shrink down instead of ending at a hard boundary.
        localPosition.y *= mix(1.0, 0.14, vDirt);

        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(localPosition, 1.0);
        float gust = sin(uTime * 1.20 + dot(bladeBase.xz, vec2(0.38, 0.27)));
        gust += sin(uTime * 2.05 + dot(bladeBase.xz, vec2(-0.13, 0.51))) * 0.38;
        float bend = pow(position.y, 1.55) * gust * uWindStrength;
        worldPosition.xz += uWindDir * bend;

        vec2 bladeFacing = normalize(vec2(instanceMatrix[0][0], instanceMatrix[0][2]));
        vLight = 0.78 + abs(dot(bladeFacing, normalize(vec2(0.65, 0.76)))) * 0.22;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGrassBottom;
      uniform vec3 uGrassTop;
      uniform vec3 uGrassDry;
      uniform vec3 uDirtColor;
      varying float vBladeHeight;
      varying float vPatch;
      varying float vDirt;
      varying float vLight;

      void main() {
        float gradient = smoothstep(0.05, 0.96, vBladeHeight);
        vec3 grass = mix(uGrassBottom, uGrassTop, gradient);
        float dryMix = smoothstep(0.49, 0.78, vPatch) * 0.42;
        grass = mix(grass, uGrassDry, dryMix);
        grass = mix(grass, uDirtColor, vDirt * 0.72);

        // A restrained warm tip lift suggests the demo's back-scatter without
        // adding a shadow map or multi-sample lighting cost on mobile.
        vec3 tipGlow = vec3(0.12, 0.16, 0.035) * pow(gradient, 3.0);
        gl_FragColor = vec4(grass * vLight + tipGlow, 1.0);
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
      grass.copy(dark).lerp(light, checker * 0.52)

      const patch = fieldFbm(worldX * 0.105 - 4.2, worldZ * 0.105 - 1.3)
      grass.lerp(dry, smoothstep(0.49, 0.78, patch) * 0.32)
      const dirtMask = smoothstep(0.61, 0.72, fieldFbm(worldX * 0.16 + 2.4, worldZ * 0.16 - 1.7))
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
}: {
  mobile: boolean
  reducedMotion: boolean
}) {
  const bladeCount = mobile ? MOBILE_BLADES : DESKTOP_BLADES
  const bladesRef = useRef<THREE.InstancedMesh>(null)
  const plazaShape = useMemo(() => makePlazaShape(), [])
  const groundGeometry = useMemo(() => new THREE.ShapeGeometry(plazaShape), [plazaShape])
  const bladeGeometry = useMemo(() => makeBladeGeometry(), [])
  const bladeMaterial = useMemo(() => makeBladeMaterial(), [])
  const groundTexture = useMemo(() => makeGroundTexture(), [])

  useEffect(() => {
    const mesh = bladesRef.current
    if (!mesh) return

    const random = seededRandom(0x62756464 + (mobile ? 1 : 0))
    const dummy = new THREE.Object3D()
    let placed = 0
    while (placed < bladeCount) {
      const x = (random() - 0.5) * FSIZE * 1.06
      const z = (random() - 0.5) * FSIZE * 1.06
      const theta = Math.atan2(z, x)
      if (Math.hypot(x, z) > plazaEdgeRadius(theta) - 0.08) continue

      const height = 0.13 + random() * 0.065
      const width = 0.034 + random() * 0.018
      dummy.position.set(x, 0.006, z)
      dummy.rotation.set(0, random() * Math.PI * 2, 0)
      dummy.scale.set(width, height, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
      placed++
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [bladeCount, mobile])

  useFrame((_, delta) => {
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
        args={[bladeGeometry, bladeMaterial, bladeCount]}
        frustumCulled={false}
      />
    </>
  )
}
