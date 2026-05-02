export const WALL_NORTH = 1;
export const WALL_EAST = 2;
export const WALL_SOUTH = 4;
export const WALL_WEST = 8;

export type Direction = "north" | "east" | "south" | "west";
export type Mode = "start" | "playing" | "won" | "lost";

export interface GridPoint {
  x: number;
  y: number;
}

export interface MazeCell {
  walls: number;
}

export interface MazeLevel {
  width: number;
  height: number;
  cells: MazeCell[];
  spawn: GridPoint;
  cheeses: GridPoint[];
  catSpawns: GridPoint[];
  levelIndex: number;
  seed: number;
}

export interface PlayerState {
  x: number;
  y: number;
  heading: number;
  radius: number;
}

export interface CatState {
  x: number;
  y: number;
  heading: number;
}

export interface GameState {
  mode: Mode;
  level: number;
  sessionSeed: number;
  maze: MazeLevel;
  player: PlayerState;
  cats: CatState[];
  collectedCheeses: boolean[];
}

export interface WallSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CollisionRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
