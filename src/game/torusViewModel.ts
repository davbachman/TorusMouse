import { Matrix4, Quaternion, Vector3 } from "three";

const TAU = Math.PI * 2;

export interface SurfaceFrame {
  position: Vector3;
  tangentU: Vector3;
  tangentV: Vector3;
  normal: Vector3;
  surfaceUnitsPerWorldU: number;
  surfaceUnitsPerWorldV: number;
}

export class TorusViewModel {
  private readonly orientationMatrix = new Matrix4();

  constructor(
    private readonly majorRadius: number,
    private readonly minorRadius: number,
  ) {}

  getFrame(
    worldX: number,
    worldY: number,
    worldWidth: number,
    worldHeight: number,
    anchorX: number,
    anchorY: number,
    anchorU = 0,
    anchorV = 0,
    lift = 0,
  ): SurfaceFrame {
    const u = anchorU - ((worldX - anchorX) / worldWidth) * TAU;
    const v = anchorV + ((worldY - anchorY) / worldHeight) * TAU;

    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);
    const radial = this.majorRadius + this.minorRadius * cosV;

    const normal = new Vector3(cosU * cosV, sinU * cosV, sinV).normalize();
    const position = new Vector3(
      radial * cosU,
      radial * sinU,
      this.minorRadius * sinV,
    ).addScaledVector(normal, lift);

    const tangentU = new Vector3(
      radial * sinU,
      -radial * cosU,
      0,
    ).normalize();

    const tangentV = new Vector3().crossVectors(normal, tangentU).normalize();

    return {
      position,
      tangentU,
      tangentV,
      normal,
      surfaceUnitsPerWorldU: (radial * TAU) / worldWidth,
      surfaceUnitsPerWorldV: (this.minorRadius * TAU) / worldHeight,
    };
  }

  orientToSurface(quaternion: Quaternion, frame: SurfaceFrame): void {
    this.orientationMatrix.makeBasis(frame.tangentU, frame.tangentV, frame.normal);
    quaternion.setFromRotationMatrix(this.orientationMatrix);
  }

  getAnchorAngles(viewerPosition: Vector3): { u: number; v: number } {
    const radial = Math.hypot(viewerPosition.x, viewerPosition.y);
    return {
      u: Math.atan2(viewerPosition.y, viewerPosition.x),
      v: Math.atan2(viewerPosition.z, radial),
    };
  }

  sampleSegment(
    worldX0: number,
    worldY0: number,
    worldX1: number,
    worldY1: number,
    worldWidth: number,
    worldHeight: number,
    anchorX: number,
    anchorY: number,
    anchorU: number,
    anchorV: number,
    lift: number,
    target: number[],
  ): void {
    const length = Math.hypot(worldX1 - worldX0, worldY1 - worldY0);
    const segments = Math.max(7, Math.ceil(length * 2.5));

    let previous = this.getFrame(
      worldX0,
      worldY0,
      worldWidth,
      worldHeight,
      anchorX,
      anchorY,
      anchorU,
      anchorV,
      lift,
    ).position;

    for (let step = 1; step <= segments; step += 1) {
      const t = step / segments;
      const next = this.getFrame(
        worldX0 + (worldX1 - worldX0) * t,
        worldY0 + (worldY1 - worldY0) * t,
        worldWidth,
        worldHeight,
        anchorX,
        anchorY,
        anchorU,
        anchorV,
        lift,
      ).position;
      target.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
      previous = next;
    }
  }
}
