import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { generateToroidalMaze, isDirectionOpen, levelSeed, traversableExits } from "./maze";
import { type SurfaceFrame, TorusViewModel } from "./torusViewModel";
import {
  type CollisionRect,
  type GameState,
  type GridPoint,
  type WallSegment,
  WALL_EAST,
  WALL_SOUTH,
} from "./types";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
  }
}

const CELL_SIZE = 4;
const WALL_HEIGHT = 2.8;
const WALL_THICKNESS = 0.34;
const MAZE_WALL_COLOR = "#6b2f22";
const PLAYER_HEIGHT = 1.05;
const PLAYER_RADIUS = 0.38;
const PLAYER_SPEED = 3.05;
const TURN_SPEED = Math.PI * 0.88;
const CHEESE_PICKUP_RADIUS = 0.72;
const FIXED_STEP = 1 / 60;

const TORUS_MAJOR_RADIUS = 2.75;
const TORUS_MINOR_RADIUS = 0.92;
const TORUS_WALL_BASE_LIFT = 0.01;
const TORUS_WALL_HEIGHT = 0.22;
const TORUS_WALL_HALF_WIDTH = 0.072;
const TORUS_WALL_RIDGE_LIFT = TORUS_WALL_HEIGHT + 0.008;
const TORUS_DECAL_LIFT = 0.02;
const LEFT_TORUS_CAMERA_POSITION = new Vector3(0, -13.2, 8.2);
const LEFT_TORUS_CAMERA_ROLL = MathUtils.degToRad(-3.2);
const LOCAL_SURFACE_NORMAL = new Vector3(0, 0, 1);
const CHEESE_PICKUP_YAW = 0.34;
const MOUSE_ART_HALF_LENGTH = 0.305;
const MOUSE_ART_HALF_WIDTH = 0.15;
const TORUS_MOUSE_VISUAL_LENGTH_SCALE = 0.94;
const TORUS_MOUSE_VISUAL_WIDTH_SCALE = 1.28;

const PLAYER_COLLISION_CIRCLES = [
  { offsetX: -0.08, offsetY: 0, radius: 0.2 },
  { offsetX: 0.15, offsetY: 0, radius: 0.14 },
  { offsetX: 0.02, offsetY: 0.19, radius: 0.1 },
  { offsetX: 0.02, offsetY: -0.19, radius: 0.1 },
] as const;

const PLAYER_COLLISION_BOUND_RADIUS = Math.max(
  ...PLAYER_COLLISION_CIRCLES.map((circle) => Math.hypot(circle.offsetX, circle.offsetY) + circle.radius),
);

const TORUS_MOUSE_HALF_LENGTH_WORLD = Math.max(
  ...PLAYER_COLLISION_CIRCLES.map((circle) => Math.abs(circle.offsetX) + circle.radius),
);

const TORUS_MOUSE_HALF_WIDTH_WORLD = Math.max(
  ...PLAYER_COLLISION_CIRCLES.map((circle) => Math.abs(circle.offsetY) + circle.radius),
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function shortestWrappedDelta(from: number, to: number, size: number): number {
  let delta = to - from;
  if (delta > size / 2) {
    delta -= size;
  }
  if (delta < -size / 2) {
    delta += size;
  }
  return delta;
}

function disposeGroup(group: Group): void {
  group.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (mesh as { material?: MeshStandardMaterial | MeshStandardMaterial[] }).material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else if (material) {
      material.dispose();
    }
  });
  group.clear();
}

function createMouseDecal(): Group {
  const group = new Group();
  const furMaterial = new MeshBasicMaterial({ color: "#f4f0e8", side: DoubleSide });
  const earMaterial = new MeshBasicMaterial({ color: "#e7b3b0", side: DoubleSide });
  const detailMaterial = new MeshBasicMaterial({ color: "#2c1b12", side: DoubleSide });
  const noseMaterial = new MeshBasicMaterial({ color: "#df8396", side: DoubleSide });

  const body = new Mesh(new CircleGeometry(0.17, 20), furMaterial);
  body.scale.set(1.35, 0.95, 1);
  group.add(body);

  const head = new Mesh(new CircleGeometry(0.13, 20), furMaterial);
  head.position.set(0.14, 0, 0.001);
  head.scale.set(1.04, 0.92, 1);
  group.add(head);

  const leftEar = new Mesh(new CircleGeometry(0.07, 18), earMaterial);
  leftEar.position.set(0.02, 0.12, 0.002);
  group.add(leftEar);

  const rightEar = new Mesh(new CircleGeometry(0.07, 18), earMaterial);
  rightEar.position.set(0.02, -0.12, 0.002);
  group.add(rightEar);

  const leftEye = new Mesh(new CircleGeometry(0.013, 12), detailMaterial);
  leftEye.position.set(0.16, 0.045, 0.003);
  group.add(leftEye);

  const rightEye = new Mesh(new CircleGeometry(0.013, 12), detailMaterial);
  rightEye.position.set(0.16, -0.045, 0.003);
  group.add(rightEye);

  const nose = new Mesh(new CircleGeometry(0.018, 12), noseMaterial);
  nose.position.set(0.25, 0, 0.004);
  group.add(nose);

  const whiskerTop = new Mesh(
    new PlaneGeometry(0.13, 0.01),
    detailMaterial,
  );
  whiskerTop.position.set(0.22, 0.05, 0.003);
  whiskerTop.rotation.z = 0.2;
  group.add(whiskerTop);

  const whiskerBottom = new Mesh(
    new PlaneGeometry(0.13, 0.01),
    detailMaterial,
  );
  whiskerBottom.position.set(0.22, -0.05, 0.003);
  whiskerBottom.rotation.z = -0.2;
  group.add(whiskerBottom);

  const tail = new Mesh(
    new PlaneGeometry(0.16, 0.018),
    noseMaterial,
  );
  tail.position.set(-0.26, 0.02, 0.001);
  tail.rotation.z = Math.PI * 0.2;
  group.add(tail);

  return group;
}

function createCheeseDecal(): Group {
  const group = new Group();
  const baseMaterial = new MeshBasicMaterial({ color: "#f4cf59", side: DoubleSide });
  const rindMaterial = new MeshBasicMaterial({ color: "#e5a93a", side: DoubleSide });
  const holeMaterial = new MeshBasicMaterial({ color: "#c8882f", side: DoubleSide });

  const shape = new Shape();
  shape.moveTo(-0.18, -0.12);
  shape.quadraticCurveTo(-0.12, -0.21, 0.08, -0.13);
  shape.lineTo(0.2, 0);
  shape.lineTo(0.08, 0.13);
  shape.quadraticCurveTo(-0.12, 0.2, -0.18, 0.12);
  shape.closePath();

  const base = new Mesh(new ShapeGeometry(shape), baseMaterial);
  group.add(base);

  const rind = new Mesh(
    new PlaneGeometry(0.11, 0.26),
    rindMaterial,
  );
  rind.position.set(-0.16, 0, 0.001);
  group.add(rind);

  const holeA = new Mesh(new CircleGeometry(0.033, 14), holeMaterial);
  holeA.position.set(0.02, 0.045, 0.002);
  group.add(holeA);

  const holeB = new Mesh(new CircleGeometry(0.026, 14), holeMaterial);
  holeB.position.set(-0.02, -0.04, 0.002);
  group.add(holeB);

  const holeC = new Mesh(new CircleGeometry(0.018, 14), holeMaterial);
  holeC.position.set(0.095, -0.01, 0.002);
  group.add(holeC);

  return group;
}

function addQuad(
  positions: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
): void {
  positions.push(
    a.x, a.y, a.z,
    b.x, b.y, b.z,
    c.x, c.y, c.z,
    a.x, a.y, a.z,
    c.x, c.y, c.z,
    d.x, d.y, d.z,
  );
}

function appendSurfaceWallSegment(
  sidePositions: number[],
  topPositions: number[],
  start: SurfaceFrame,
  end: SurfaceFrame,
): void {
  const segmentDirection = end.position.clone().sub(start.position);
  if (segmentDirection.lengthSq() < 1e-6) {
    return;
  }
  segmentDirection.normalize();

  const sideStart = new Vector3().crossVectors(start.normal, segmentDirection);
  const sideEnd = new Vector3().crossVectors(end.normal, segmentDirection);
  if (sideStart.lengthSq() < 1e-6 || sideEnd.lengthSq() < 1e-6) {
    return;
  }
  sideStart.normalize().multiplyScalar(TORUS_WALL_HALF_WIDTH);
  sideEnd.normalize().multiplyScalar(TORUS_WALL_HALF_WIDTH);

  const left0 = start.position.clone().add(sideStart);
  const right0 = start.position.clone().sub(sideStart);
  const left1 = end.position.clone().add(sideEnd);
  const right1 = end.position.clone().sub(sideEnd);

  const topLeft0 = left0.clone().addScaledVector(start.normal, TORUS_WALL_HEIGHT);
  const topRight0 = right0.clone().addScaledVector(start.normal, TORUS_WALL_HEIGHT);
  const topLeft1 = left1.clone().addScaledVector(end.normal, TORUS_WALL_HEIGHT);
  const topRight1 = right1.clone().addScaledVector(end.normal, TORUS_WALL_HEIGHT);

  addQuad(sidePositions, left0, left1, topLeft1, topLeft0);
  addQuad(sidePositions, right1, right0, topRight0, topRight1);
  addQuad(topPositions, topLeft0, topLeft1, topRight1, topRight0);
  addQuad(sidePositions, right0, left0, topLeft0, topRight0);
  addQuad(sidePositions, left1, right1, topRight1, topLeft1);
}

function createCheesePickup(): Group {
  const group = new Group();
  const radius = 0.52;
  const thickness = 0.3;
  const angle = Math.PI * 0.42;
  const wedge = new Group();
  const capNormal = new Vector3();
  const circleNormal = new Vector3(0, 0, 1);
  const cheeseBodyMaterial = new MeshStandardMaterial({
    color: "#f4cb55",
    flatShading: true,
    roughness: 0.96,
    metalness: 0.02,
  });
  const cheeseCutMaterial = new MeshStandardMaterial({
    color: "#f4cb55",
    flatShading: true,
    roughness: 0.96,
    metalness: 0.02,
    side: DoubleSide,
  });
  const rindMaterial = new MeshStandardMaterial({
    color: "#d79d33",
    flatShading: true,
    roughness: 1,
    metalness: 0,
    side: DoubleSide,
  });

  wedge.rotation.z = Math.PI / 2;
  wedge.position.y = 0.38;
  group.add(wedge);

  const cheeseBody = new Mesh(
    new CylinderGeometry(
      radius,
      radius,
      thickness,
      36,
      1,
      false,
      -angle / 2,
      angle,
    ),
    cheeseBodyMaterial,
  );
  wedge.add(cheeseBody);

  const rind = new Mesh(
    new CylinderGeometry(
      radius * 1.02,
      radius * 1.02,
      thickness * 0.94,
      24,
      1,
      true,
      -angle / 2,
      angle,
    ),
    rindMaterial,
  );
  wedge.add(rind);

  for (const faceAngle of [-angle / 2, angle / 2]) {
    const cutFace = new Mesh(new PlaneGeometry(radius, thickness), cheeseCutMaterial);
    cutFace.rotation.y = faceAngle - Math.PI / 2;
    cutFace.position.set(
      Math.sin(faceAngle) * radius * 0.5,
      0,
      Math.cos(faceAngle) * radius * 0.5,
    );
    wedge.add(cutFace);
  }

  const holeRimMaterial = new MeshBasicMaterial({
    color: "#aa7a2f",
    side: DoubleSide,
  });
  const holeCoreMaterial = new MeshBasicMaterial({
    color: "#5a3810",
    side: DoubleSide,
  });

  const capHoles = [
    { angle: -angle * 0.14, radial: radius * 0.3, radius: 0.054 },
    { angle: angle * 0.02, radial: radius * 0.2, radius: 0.044 },
    { angle: angle * 0.2, radial: radius * 0.42, radius: 0.038 },
  ];

  for (const capSign of [-1, 1]) {
    capNormal.set(0, capSign, 0);
    for (const hole of capHoles) {
      const holeCenter = new Vector3(
        Math.sin(hole.angle) * hole.radial,
        capSign * (thickness / 2 + 0.004),
        Math.cos(hole.angle) * hole.radial,
      );
      const rim = new Mesh(new CircleGeometry(hole.radius, 18), holeRimMaterial);
      rim.position.copy(holeCenter);
      rim.quaternion.setFromUnitVectors(circleNormal, capNormal);
      wedge.add(rim);

      const core = new Mesh(new CircleGeometry(hole.radius * 0.62, 18), holeCoreMaterial);
      core.position.copy(holeCenter).addScaledVector(capNormal, 0.002);
      core.quaternion.copy(rim.quaternion);
      wedge.add(core);
    }
  }

  const baseShadow = new Mesh(
    new CircleGeometry(0.42, 20),
    new MeshBasicMaterial({
      color: "#8b6836",
      transparent: true,
      opacity: 0.22,
    }),
  );
  baseShadow.rotation.x = -Math.PI / 2;
  baseShadow.position.y = 0.03;
  group.add(baseShadow);

  return group;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly hud: HTMLElement;
  private readonly cheeseCounter: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayText: HTMLElement;
  private readonly overlaySubtext: HTMLElement;

  private readonly renderer: WebGLRenderer;
  private readonly leftScene = new Scene();
  private readonly rightScene = new Scene();
  private readonly leftCamera = new PerspectiveCamera(36, 1, 0.1, 50);
  private readonly rightCamera = new PerspectiveCamera(68, 1, 0.1, 220);
  private readonly leftClearColor = new Color("#efe4cc");
  private readonly rightClearColor = new Color("#e3d4bb");
  private readonly torusViewModel = new TorusViewModel(TORUS_MAJOR_RADIUS, TORUS_MINOR_RADIUS);
  private readonly torusWalls = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      color: "#5b2419",
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  private readonly torusWallTops = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      color: "#80402b",
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  private readonly torusWallRidges = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: "#3a170f",
      transparent: true,
      opacity: 0.28,
    }),
  );
  private readonly mouseDecal = createMouseDecal();
  private readonly torusCheeseGroup = new Group();
  private readonly mazeGroup = new Group();
  private readonly cheesePickupGroup = new Group();
  private readonly keys = new Set<string>();
  private readonly sessionSeed = 0x5eedb33f;
  private readonly collisionScratch = new Vector2();
  private readonly mouseHeadingRotation = new Quaternion();

  private state: GameState;
  private torusCheeseDecals: Group[] = [];
  private cheesePickups: Group[] = [];
  private wallSegments: WallSegment[] = [];
  private collisionWalls: CollisionRect[] = [];
  private accumulator = 0;
  private lastFrameTime = 0;
  private animationFrameId = 0;
  private manualTimeControl = false;
  private runtimeSeconds = 0;

  constructor(private readonly root: HTMLElement) {
    const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas");
    const hud = root.querySelector<HTMLElement>("#hud");
    const cheeseCounter = root.querySelector<HTMLElement>("#cheese-counter");
    const overlay = root.querySelector<HTMLElement>("#overlay");
    const overlayTitle = root.querySelector<HTMLElement>("#overlay-title");
    const overlayText = root.querySelector<HTMLElement>("#overlay-text");
    const overlaySubtext = root.querySelector<HTMLElement>("#overlay-subtext");

    if (!canvas || !hud || !cheeseCounter || !overlay || !overlayTitle || !overlayText || !overlaySubtext) {
      throw new Error("Missing game DOM elements");
    }

    this.canvas = canvas;
    this.hud = hud;
    this.cheeseCounter = cheeseCounter;
    this.overlay = overlay;
    this.overlayTitle = overlayTitle;
    this.overlayText = overlayText;
    this.overlaySubtext = overlaySubtext;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.autoClear = false;

    this.leftCamera.position.copy(LEFT_TORUS_CAMERA_POSITION);
    this.leftCamera.lookAt(0, 0, 0);
    this.leftCamera.rotateZ(LEFT_TORUS_CAMERA_ROLL);

    this.rightCamera.position.set(CELL_SIZE * 0.5, PLAYER_HEIGHT, CELL_SIZE * 0.5);

    this.configureScenes();

    const initialMaze = generateToroidalMaze(0, levelSeed(this.sessionSeed, 0));
    this.state = {
      mode: "start",
      level: 1,
      sessionSeed: this.sessionSeed,
      maze: initialMaze,
      player: {
        x: CELL_SIZE * 0.5,
        y: CELL_SIZE * 0.5,
        heading: 0,
        radius: PLAYER_COLLISION_BOUND_RADIUS,
      },
      collectedCheeses: initialMaze.cheeses.map(() => false),
    };

    this.rebuildLevelGeometry();
    this.resize();
    this.bindEvents();
    this.updateUi();
    this.exposeTestingHooks();
    this.render();
    this.animationFrameId = window.requestAnimationFrame(this.onFrame);
  }

  private configureScenes(): void {
    this.leftScene.add(new AmbientLight("#fff6e4", 1.4));
    const leftKey = new DirectionalLight("#fff2d2", 1.1);
    leftKey.position.set(-5, -6, 8);
    this.leftScene.add(leftKey);

    const torus = new Mesh(
      new TorusGeometry(TORUS_MAJOR_RADIUS, TORUS_MINOR_RADIUS, 32, 120),
      new MeshStandardMaterial({
        color: "#cf8350",
        roughness: 0.92,
        metalness: 0.04,
        flatShading: true,
      }),
    );
    this.leftScene.add(torus);
    this.leftScene.add(this.mouseDecal);
    this.leftScene.add(this.torusCheeseGroup);

    this.rightScene.add(new HemisphereLight("#fff6dc", "#b48a5d", 1.45));
    const corridorLight = new DirectionalLight("#fff9eb", 1.4);
    corridorLight.position.set(4, 8, 2);
    this.rightScene.add(corridorLight);
    this.rightScene.add(this.mazeGroup);
    this.rightScene.add(this.cheesePickupGroup);
  }

  private bindEvents(): void {
    window.addEventListener("resize", this.resize);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private exposeTestingHooks(): void {
    window.render_game_to_text = () => this.renderGameToText();
    window.advanceTime = async (ms: number) => {
      this.manualTimeControl = true;
      this.stepSimulation(ms / 1000);
      this.render();
    };
  }

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (["ArrowUp", "ArrowLeft", "ArrowRight", "Space", "KeyF"].includes(event.code)) {
      event.preventDefault();
    }

    if (event.repeat) {
      return;
    }

    if (event.code === "KeyF") {
      void this.toggleFullscreen();
      return;
    }

    if (this.state.mode === "start" && ["ArrowUp", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      this.state.mode = "playing";
      this.updateUi();
    } else if (this.state.mode === "won" && event.code === "Space") {
      this.loadLevel(this.state.maze.levelIndex + 1, "playing");
      return;
    }

    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly resize = (): void => {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;

    this.renderer.setSize(width, height, false);
    this.leftCamera.aspect = width / 2 / height;
    this.rightCamera.aspect = width / 2 / height;
    this.leftCamera.updateProjectionMatrix();
    this.rightCamera.updateProjectionMatrix();
    this.render();
  };

  private readonly onFrame = (timestamp: number): void => {
    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
    }
    const deltaSeconds = Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = timestamp;

    if (!this.manualTimeControl) {
      this.stepSimulation(deltaSeconds);
    }
    this.render();
    this.animationFrameId = window.requestAnimationFrame(this.onFrame);
  };

  private stepSimulation(deltaSeconds: number): void {
    this.accumulator += deltaSeconds;
    while (this.accumulator >= FIXED_STEP) {
      this.update(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
  }

  private update(deltaSeconds: number): void {
    this.runtimeSeconds += deltaSeconds;
    if (this.state.mode !== "playing") {
      return;
    }

    const turnDirection =
      (this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("ArrowLeft") ? 1 : 0);
    this.state.player.heading += turnDirection * TURN_SPEED * deltaSeconds;

    if (this.keys.has("ArrowUp")) {
      const distance = PLAYER_SPEED * deltaSeconds;
      const steps = Math.max(1, Math.ceil(distance / (PLAYER_COLLISION_BOUND_RADIUS * 0.45)));
      const stepDistance = distance / steps;
      for (let index = 0; index < steps; index += 1) {
        this.state.player.x += Math.cos(this.state.player.heading) * stepDistance;
        this.state.player.y += Math.sin(this.state.player.heading) * stepDistance;
        this.state.player.x = wrap(this.state.player.x, this.worldWidth);
        this.state.player.y = wrap(this.state.player.y, this.worldHeight);
        this.resolveWallCollisions();
      }
    }

    const collectedThisTick = this.collectTouchedCheeses();
    if (collectedThisTick > 0) {
      if (this.remainingCheeseCount === 0) {
        this.state.mode = "won";
        this.keys.clear();
      }
      this.updateUi();
    }
  }

  private resolveWallCollisions(): void {
    this.collisionScratch.set(this.state.player.x, this.state.player.y);
    const sinHeading = Math.sin(this.state.player.heading);
    const cosHeading = Math.cos(this.state.player.heading);

    for (let pass = 0; pass < 4; pass += 1) {
      let collided = false;
      for (const offsetX of [-this.worldWidth, 0, this.worldWidth]) {
        for (const offsetY of [-this.worldHeight, 0, this.worldHeight]) {
          for (const wall of this.collisionWalls) {
            const minX = wall.minX + offsetX;
            const maxX = wall.maxX + offsetX;
            const minY = wall.minY + offsetY;
            const maxY = wall.maxY + offsetY;
            for (const circle of PLAYER_COLLISION_CIRCLES) {
              const circleX =
                this.collisionScratch.x + circle.offsetX * cosHeading - circle.offsetY * sinHeading;
              const circleY =
                this.collisionScratch.y + circle.offsetX * sinHeading + circle.offsetY * cosHeading;

              const closestX = clamp(circleX, minX, maxX);
              const closestY = clamp(circleY, minY, maxY);
              let pushX = circleX - closestX;
              let pushY = circleY - closestY;
              let distance = Math.hypot(pushX, pushY);

              if (distance >= circle.radius) {
                continue;
              }

              collided = true;
              if (distance < 1e-6) {
                const distances = [
                  { axis: "x", value: Math.abs(circleX - minX), sign: -1 },
                  { axis: "x", value: Math.abs(maxX - circleX), sign: 1 },
                  { axis: "y", value: Math.abs(circleY - minY), sign: -1 },
                  { axis: "y", value: Math.abs(maxY - circleY), sign: 1 },
                ].sort((a, b) => a.value - b.value);
                const nearest = distances[0];
                if (nearest.axis === "x") {
                  pushX = nearest.sign;
                  pushY = 0;
                } else {
                  pushX = 0;
                  pushY = nearest.sign;
                }
                distance = 1;
              }

              const pushDistance = circle.radius - distance + 0.0001;
              this.collisionScratch.x += (pushX / distance) * pushDistance;
              this.collisionScratch.y += (pushY / distance) * pushDistance;
            }
          }
        }
      }

      this.collisionScratch.x = wrap(this.collisionScratch.x, this.worldWidth);
      this.collisionScratch.y = wrap(this.collisionScratch.y, this.worldHeight);

      if (!collided) {
        break;
      }
    }

    this.state.player.x = this.collisionScratch.x;
    this.state.player.y = this.collisionScratch.y;
  }

  private collectTouchedCheeses(): number {
    let collectedCount = 0;

    for (let index = 0; index < this.state.maze.cheeses.length; index += 1) {
      if (this.state.collectedCheeses[index]) {
        continue;
      }

      const cheese = this.state.maze.cheeses[index];
      const cheeseX = (cheese.x + 0.5) * CELL_SIZE;
      const cheeseY = (cheese.y + 0.5) * CELL_SIZE;
      const deltaX = shortestWrappedDelta(this.state.player.x, cheeseX, this.worldWidth);
      const deltaY = shortestWrappedDelta(this.state.player.y, cheeseY, this.worldHeight);
      if (Math.hypot(deltaX, deltaY) >= CHEESE_PICKUP_RADIUS) {
        continue;
      }

      this.state.collectedCheeses[index] = true;
      collectedCount += 1;
    }

    return collectedCount;
  }

  private worldToCell(x: number, y: number): GridPoint {
    return {
      x: Math.floor(wrap(x, this.worldWidth) / CELL_SIZE),
      y: Math.floor(wrap(y, this.worldHeight) / CELL_SIZE),
    };
  }

  private loadLevel(levelIndex: number, mode: GameState["mode"]): void {
    const maze = generateToroidalMaze(levelIndex, levelSeed(this.sessionSeed, levelIndex));
    this.state.level = levelIndex + 1;
    this.state.mode = mode;
    this.state.maze = maze;
    this.state.player.x = CELL_SIZE * 0.5;
    this.state.player.y = CELL_SIZE * 0.5;
    this.state.player.heading = 0;
    this.state.collectedCheeses = maze.cheeses.map(() => false);
    this.accumulator = 0;
    this.rebuildLevelGeometry();
    this.updateUi();
    this.render();
  }

  private rebuildLevelGeometry(): void {
    disposeGroup(this.mazeGroup);
    this.rebuildCheeseActors();
    this.wallSegments = [];
    this.collisionWalls = [];

    const floorGeometry = new PlaneGeometry(this.worldWidth, this.worldHeight);
    const ceilingGeometry = new PlaneGeometry(this.worldWidth, this.worldHeight);
    const floorMaterial = new MeshStandardMaterial({
      color: "#c7b49a",
      flatShading: true,
      roughness: 1,
      metalness: 0,
    });
    const ceilingMaterial = new MeshStandardMaterial({
      color: "#d8c7b1",
      flatShading: true,
      roughness: 1,
      metalness: 0,
      side: DoubleSide,
    });
    const eastWallGeometry = new BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS);
    const southWallGeometry = new BoxGeometry(CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const wallMaterial = new MeshStandardMaterial({
      color: MAZE_WALL_COLOR,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.02,
    });

    for (const tileX of [-1, 0, 1]) {
      for (const tileY of [-1, 0, 1]) {
        const floor = new Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(
          tileX * this.worldWidth + this.worldWidth / 2,
          0,
          tileY * this.worldHeight + this.worldHeight / 2,
        );
        this.mazeGroup.add(floor);

        const ceiling = new Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(
          tileX * this.worldWidth + this.worldWidth / 2,
          WALL_HEIGHT,
          tileY * this.worldHeight + this.worldHeight / 2,
        );
        this.mazeGroup.add(ceiling);
      }
    }

    for (let y = 0; y < this.state.maze.height; y += 1) {
      for (let x = 0; x < this.state.maze.width; x += 1) {
        const cell = this.state.maze.cells[y * this.state.maze.width + x];

        if ((cell.walls & WALL_EAST) !== 0) {
          this.collisionWalls.push({
            minX: (x + 1) * CELL_SIZE - WALL_THICKNESS / 2,
            maxX: (x + 1) * CELL_SIZE + WALL_THICKNESS / 2,
            minY: y * CELL_SIZE - WALL_THICKNESS / 2,
            maxY: (y + 1) * CELL_SIZE + WALL_THICKNESS / 2,
          });

          for (const tileX of [-1, 0, 1]) {
            for (const tileY of [-1, 0, 1]) {
              const eastWall = new Mesh(eastWallGeometry, wallMaterial);
              eastWall.position.set(
                tileX * this.worldWidth + (x + 1) * CELL_SIZE,
                WALL_HEIGHT / 2,
                tileY * this.worldHeight + (y + 0.5) * CELL_SIZE,
              );
              this.mazeGroup.add(eastWall);
            }
          }
        }

        if ((cell.walls & WALL_SOUTH) !== 0) {
          this.collisionWalls.push({
            minX: x * CELL_SIZE - WALL_THICKNESS / 2,
            maxX: (x + 1) * CELL_SIZE + WALL_THICKNESS / 2,
            minY: (y + 1) * CELL_SIZE - WALL_THICKNESS / 2,
            maxY: (y + 1) * CELL_SIZE + WALL_THICKNESS / 2,
          });

          for (const tileX of [-1, 0, 1]) {
            for (const tileY of [-1, 0, 1]) {
              const southWall = new Mesh(southWallGeometry, wallMaterial);
              southWall.position.set(
                tileX * this.worldWidth + (x + 0.5) * CELL_SIZE,
                WALL_HEIGHT / 2,
                tileY * this.worldHeight + (y + 1) * CELL_SIZE,
              );
              this.mazeGroup.add(southWall);
            }
          }
        }
      }
    }
  }

  private rebuildCheeseActors(): void {
    disposeGroup(this.torusCheeseGroup);
    disposeGroup(this.cheesePickupGroup);
    this.torusCheeseDecals = [];
    this.cheesePickups = [];

    for (let index = 0; index < this.state.maze.cheeses.length; index += 1) {
      const torusCheese = createCheeseDecal();
      this.torusCheeseGroup.add(torusCheese);
      this.torusCheeseDecals.push(torusCheese);

      const pickup = createCheesePickup();
      this.cheesePickupGroup.add(pickup);
      this.cheesePickups.push(pickup);
    }
  }

  private updateUi(): void {
    this.hud.textContent = `Level ${this.state.level}  ${this.state.maze.width}x${this.state.maze.height}`;
    this.cheeseCounter.textContent = `Cheese ${this.foundCheeseCount}/${this.state.maze.cheeses.length}`;

    if (this.state.mode === "playing") {
      this.overlay.classList.add("hidden");
      return;
    }

    this.overlay.classList.remove("hidden");
    if (this.state.mode === "start") {
      this.overlayTitle.textContent = "Torus Mouse";
      this.overlayText.textContent =
        "Steer the mouse through a toroidal maze and find all ten cheeses. The left side shows the torus with the mouse and the remaining cheese locations while the right side shows what the mouse sees inside the maze.";
      this.overlaySubtext.textContent =
        "Arrow Left and Right turn. Arrow Up moves forward. Press Space or any arrow key to begin. Press F for fullscreen.";
      return;
    }

    this.overlayTitle.textContent = "All cheese found";
    this.overlayText.textContent = `Level ${this.state.level} is complete. You found all ${this.state.maze.cheeses.length} cheeses. The next maze grows until the labyrinth reaches 16 by 16.`;
    this.overlaySubtext.textContent = "Press Space for next level.";
  }

  private render(): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const leftWidth = Math.floor(width / 2);
    const rightWidth = width - leftWidth;

    this.updateSplitViews();

    this.renderer.setViewport(0, 0, leftWidth, height);
    this.renderer.setScissor(0, 0, leftWidth, height);
    this.renderer.setClearColor(this.leftClearColor);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.leftScene, this.leftCamera);

    this.renderer.setViewport(leftWidth, 0, rightWidth, height);
    this.renderer.setScissor(leftWidth, 0, rightWidth, height);
    this.renderer.setClearColor(this.rightClearColor);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.rightScene, this.rightCamera);
  }

  private updateSplitViews(): void {
    const worldWidth = this.worldWidth;
    const worldHeight = this.worldHeight;
    const player = this.state.player;
    const { u: anchorU, v: anchorV } = this.torusViewModel.getAnchorAngles(this.leftCamera.position);

    const mouseFrame = this.torusViewModel.getFrame(
      player.x,
      player.y,
      worldWidth,
      worldHeight,
      player.x,
      player.y,
      anchorU,
      anchorV,
      TORUS_DECAL_LIFT,
    );
    this.mouseDecal.position.copy(mouseFrame.position);
    this.mouseDecal.scale.set(
      ((mouseFrame.surfaceUnitsPerWorldU * TORUS_MOUSE_HALF_LENGTH_WORLD) / MOUSE_ART_HALF_LENGTH) *
        TORUS_MOUSE_VISUAL_LENGTH_SCALE,
      ((mouseFrame.surfaceUnitsPerWorldV * TORUS_MOUSE_HALF_WIDTH_WORLD) / MOUSE_ART_HALF_WIDTH) *
        TORUS_MOUSE_VISUAL_WIDTH_SCALE,
      1,
    );
    this.torusViewModel.orientToSurface(this.mouseDecal.quaternion, mouseFrame);
    this.mouseDecal.quaternion.multiply(
      this.mouseHeadingRotation.setFromAxisAngle(LOCAL_SURFACE_NORMAL, -player.heading),
    );

    for (let index = 0; index < this.state.maze.cheeses.length; index += 1) {
      const cheese = this.state.maze.cheeses[index];
      const cheeseDecal = this.torusCheeseDecals[index];
      const cheesePickup = this.cheesePickups[index];
      if (!cheeseDecal || !cheesePickup) {
        continue;
      }

      const cheeseX = (cheese.x + 0.5) * CELL_SIZE;
      const cheeseY = (cheese.y + 0.5) * CELL_SIZE;
      const collected = this.state.collectedCheeses[index];

      const cheeseFrame = this.torusViewModel.getFrame(
        cheeseX,
        cheeseY,
        worldWidth,
        worldHeight,
        player.x,
        player.y,
        anchorU,
        anchorV,
        TORUS_DECAL_LIFT,
      );
      cheeseDecal.visible = !collected;
      cheeseDecal.position.copy(cheeseFrame.position);
      this.torusViewModel.orientToSurface(cheeseDecal.quaternion, cheeseFrame);

      const cheesePosition = this.nearestWrappedInstance(cheeseX, cheeseY);
      cheesePickup.visible = !collected;
      cheesePickup.position.set(
        cheesePosition.x,
        0.05 + Math.sin(this.runtimeSeconds * 4 + index * 0.7) * 0.05,
        cheesePosition.y,
      );
      cheesePickup.rotation.y = CHEESE_PICKUP_YAW + index * 0.08;
    }

    this.rightCamera.position.set(player.x, PLAYER_HEIGHT, player.y);
    this.rightCamera.lookAt(
      player.x + Math.cos(player.heading),
      PLAYER_HEIGHT,
      player.y + Math.sin(player.heading),
    );
  }

  private nearestWrappedInstance(baseX: number, baseY: number): Vector2 {
    let bestX = baseX;
    let bestY = baseY;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const offsetX of [-this.worldWidth, 0, this.worldWidth]) {
      for (const offsetY of [-this.worldHeight, 0, this.worldHeight]) {
        const candidateX = baseX + offsetX;
        const candidateY = baseY + offsetY;
        const distance = Math.hypot(candidateX - this.state.player.x, candidateY - this.state.player.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestX = candidateX;
          bestY = candidateY;
        }
      }
    }

    return new Vector2(bestX, bestY);
  }

  private renderGameToText(): string {
    const playerCell = this.worldToCell(this.state.player.x, this.state.player.y);
    const exits = traversableExits(this.state.maze, playerCell.x, playerCell.y);
    const headingDegrees = Math.round(MathUtils.radToDeg(this.state.player.heading));
    const remainingCheeseCells = this.state.maze.cheeses.filter((_, index) => !this.state.collectedCheeses[index]);

    return JSON.stringify({
      mode: this.state.mode,
      level: this.state.level,
      maze: {
        width: this.state.maze.width,
        height: this.state.maze.height,
        cellSize: CELL_SIZE,
      },
      coordinates: "origin top-left; x increases east; y increases south; maze wraps on both axes",
      player: {
        x: Number(this.state.player.x.toFixed(2)),
        y: Number(this.state.player.y.toFixed(2)),
        cell: playerCell,
        headingDegrees,
      },
      cheese: {
        found: this.foundCheeseCount,
        total: this.state.maze.cheeses.length,
        remainingCells: remainingCheeseCells,
      },
      traversableExits: exits,
      canMoveForward: this.canMoveForward(playerCell.x, playerCell.y, this.state.player.heading),
    });
  }

  private canMoveForward(cellX: number, cellY: number, heading: number): boolean {
    const directionIndex = Math.round(wrap(heading, Math.PI * 2) / (Math.PI / 2)) % 4;
    if (directionIndex === 0) {
      return isDirectionOpen(this.state.maze, cellX, cellY, "east");
    }
    if (directionIndex === 1) {
      return isDirectionOpen(this.state.maze, cellX, cellY, "south");
    }
    if (directionIndex === 2) {
      return isDirectionOpen(this.state.maze, cellX, cellY, "west");
    }
    return isDirectionOpen(this.state.maze, cellX, cellY, "north");
  }

  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await this.root.requestFullscreen();
  }

  private get worldWidth(): number {
    return this.state.maze.width * CELL_SIZE;
  }

  private get worldHeight(): number {
    return this.state.maze.height * CELL_SIZE;
  }

  private get foundCheeseCount(): number {
    return this.state.collectedCheeses.reduce((count, collected) => count + (collected ? 1 : 0), 0);
  }

  private get remainingCheeseCount(): number {
    return this.state.maze.cheeses.length - this.foundCheeseCount;
  }
}
