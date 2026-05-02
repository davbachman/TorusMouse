declare module "three" {
  export const DoubleSide: number;

  export class Material {
    dispose(): void;
  }

  export class Matrix4 {
    makeBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this;
  }

  export class Quaternion {
    copy(quaternion: Quaternion): this;
    multiply(quaternion: Quaternion): this;
    setFromAxisAngle(axis: Vector3, angle: number): this;
    setFromRotationMatrix(matrix: Matrix4): this;
    setFromUnitVectors(from: Vector3, to: Vector3): this;
  }

  export class Vector2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
    set(x: number, y: number): this;
  }

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    add(vector: Vector3): this;
    addScaledVector(vector: Vector3, scale: number): this;
    clone(): Vector3;
    copy(vector: Vector3): this;
    crossVectors(a: Vector3, b: Vector3): this;
    lengthSq(): number;
    multiplyScalar(scale: number): this;
    normalize(): this;
    set(x: number, y: number, z: number): this;
    sub(vector: Vector3): this;
  }

  export class Color {
    constructor(color?: string | number);
  }

  export class Object3D {
    geometry?: BufferGeometry;
    material?: Material | Material[];
    position: Vector3;
    quaternion: Quaternion;
    rotation: { x: number; y: number; z: number };
    scale: Vector3;
    visible: boolean;
    add(...children: Object3D[]): this;
    clear(): this;
    lookAt(x: number | Vector3, y?: number, z?: number): void;
    rotateZ(angle: number): this;
    traverse(callback: (child: Object3D) => void): void;
  }

  export class Group extends Object3D {}

  export class Scene extends Object3D {}

  export class Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
    constructor(geometry?: unknown, material?: unknown);
  }

  export class LineSegments extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
    constructor(geometry?: unknown, material?: unknown);
  }

  export class AmbientLight extends Object3D {
    constructor(color?: string | number, intensity?: number);
  }

  export class DirectionalLight extends Object3D {
    constructor(color?: string | number, intensity?: number);
  }

  export class HemisphereLight extends Object3D {
    constructor(skyColor?: string | number, groundColor?: string | number, intensity?: number);
  }

  export class PerspectiveCamera extends Object3D {
    aspect: number;
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    updateProjectionMatrix(): void;
  }

  export class BufferGeometry {
    dispose(): void;
    setAttribute(name: string, attribute: unknown): this;
    computeBoundingSphere(): void;
  }

  export class Float32BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(...args: unknown[]);
  }

  export class CircleGeometry extends BufferGeometry {
    constructor(...args: unknown[]);
  }

  export class CylinderGeometry extends BufferGeometry {
    constructor(...args: unknown[]);
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(...args: unknown[]);
  }

  export class ShapeGeometry extends BufferGeometry {
    constructor(...args: unknown[]);
  }

  export class TorusGeometry extends BufferGeometry {
    constructor(...args: unknown[]);
  }

  export class MaterialWithOptions extends Material {
    constructor(options?: Record<string, unknown>);
  }

  export class LineBasicMaterial extends MaterialWithOptions {}
  export class MeshBasicMaterial extends MaterialWithOptions {}
  export class MeshStandardMaterial extends MaterialWithOptions {}

  export class Shape {
    closePath(): void;
    lineTo(x: number, y: number): void;
    moveTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  }

  export class WebGLRenderer {
    autoClear: boolean;
    constructor(options?: Record<string, unknown>);
    clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    setClearColor(color: Color | string | number): void;
    setPixelRatio(value: number): void;
    setScissor(x: number, y: number, width: number, height: number): void;
    setScissorTest(enabled: boolean): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setViewport(x: number, y: number, width: number, height: number): void;
  }

  export const MathUtils: {
    degToRad(degrees: number): number;
    radToDeg(radians: number): number;
  };
}
