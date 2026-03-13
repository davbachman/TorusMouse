import {
  type Direction,
  type GridPoint,
  type MazeLevel,
  WALL_EAST,
  WALL_NORTH,
  WALL_SOUTH,
  WALL_WEST,
} from "./types";

const ALL_WALLS = WALL_NORTH | WALL_EAST | WALL_SOUTH | WALL_WEST;
const GOLDEN_RATIO_32 = 0x9e3779b1;
const CHEESE_COUNT = 10;

const OPPOSITE_WALL: Record<number, number> = {
  [WALL_NORTH]: WALL_SOUTH,
  [WALL_EAST]: WALL_WEST,
  [WALL_SOUTH]: WALL_NORTH,
  [WALL_WEST]: WALL_EAST,
};

const DIRECTION_TO_WALL: Record<Direction, number> = {
  north: WALL_NORTH,
  east: WALL_EAST,
  south: WALL_SOUTH,
  west: WALL_WEST,
};

class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(value: number): number {
    if (this.parent[value] !== value) {
      this.parent[value] = this.find(this.parent[value]);
    }
    return this.parent[value];
  }

  union(a: number, b: number): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) {
      return false;
    }
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
      return true;
    }
    if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
      return true;
    }
    this.parent[rootB] = rootA;
    this.rank[rootA] += 1;
    return true;
  }
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function indexFor(x: number, y: number, width: number): number {
  return y * width + x;
}

function openPassage(cells: { walls: number }[], width: number, height: number, a: GridPoint, b: GridPoint): void {
  const dx = wrap(b.x - a.x, width);
  const dy = wrap(b.y - a.y, height);

  let wall = WALL_EAST;
  if (dx === width - 1) {
    wall = WALL_WEST;
  } else if (dy === 1) {
    wall = WALL_SOUTH;
  } else if (dy === height - 1) {
    wall = WALL_NORTH;
  }

  const indexA = indexFor(a.x, a.y, width);
  const indexB = indexFor(b.x, b.y, width);
  cells[indexA].walls &= ~wall;
  cells[indexB].walls &= ~OPPOSITE_WALL[wall];
}

function levelDimensions(levelIndex: number): GridPoint {
  const base = 8;
  const growth = Math.min(levelIndex, 4) * 2;
  return {
    x: base + growth,
    y: base + growth,
  };
}

interface Edge {
  a: GridPoint;
  b: GridPoint;
}

function collectOpenNeighbors(maze: MazeLevel, point: GridPoint): GridPoint[] {
  const neighbors: GridPoint[] = [];
  const cell = maze.cells[indexFor(point.x, point.y, maze.width)];
  if ((cell.walls & WALL_NORTH) === 0) {
    neighbors.push({ x: point.x, y: wrap(point.y - 1, maze.height) });
  }
  if ((cell.walls & WALL_EAST) === 0) {
    neighbors.push({ x: wrap(point.x + 1, maze.width), y: point.y });
  }
  if ((cell.walls & WALL_SOUTH) === 0) {
    neighbors.push({ x: point.x, y: wrap(point.y + 1, maze.height) });
  }
  if ((cell.walls & WALL_WEST) === 0) {
    neighbors.push({ x: wrap(point.x - 1, maze.width), y: point.y });
  }
  return neighbors;
}

function findFarthestCell(maze: MazeLevel, start: GridPoint): GridPoint {
  const queue: GridPoint[] = [start];
  const distance = new Map<string, number>();
  distance.set(`${start.x},${start.y}`, 0);

  let farthest = start;
  let farthestDistance = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distance.get(`${current.x},${current.y}`) ?? 0;
    if (currentDistance > farthestDistance) {
      farthestDistance = currentDistance;
      farthest = current;
    }

    for (const neighbor of collectOpenNeighbors(maze, current)) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (distance.has(key)) {
        continue;
      }
      distance.set(key, currentDistance + 1);
      queue.push(neighbor);
    }
  }

  return farthest;
}

function keyForPoint(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function computeDistances(maze: MazeLevel, start: GridPoint): Map<string, number> {
  const queue: GridPoint[] = [start];
  const distance = new Map<string, number>();
  distance.set(keyForPoint(start), 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distance.get(keyForPoint(current)) ?? 0;

    for (const neighbor of collectOpenNeighbors(maze, current)) {
      const key = keyForPoint(neighbor);
      if (distance.has(key)) {
        continue;
      }
      distance.set(key, currentDistance + 1);
      queue.push(neighbor);
    }
  }

  return distance;
}

function pickCheeseCells(maze: MazeLevel, rng: () => number, count: number): GridPoint[] {
  const spawnKey = keyForPoint(maze.spawn);
  const spawnDistances = computeDistances(maze, maze.spawn);
  const candidates = Array.from({ length: maze.width * maze.height }, (_, index) => ({
    x: index % maze.width,
    y: Math.floor(index / maze.width),
  })).filter((point) => keyForPoint(point) !== spawnKey);

  const tieBreakers = new Map<string, number>();
  for (const point of candidates) {
    tieBreakers.set(keyForPoint(point), rng());
  }

  const selected: GridPoint[] = [];
  const selectedKeys = new Set<string>();
  const selectedDistances = new Map<string, Map<string, number>>();
  const totalCount = Math.min(count, candidates.length);

  while (selected.length < totalCount) {
    let bestPoint: GridPoint | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTieBreaker = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const candidateKey = keyForPoint(candidate);
      if (selectedKeys.has(candidateKey)) {
        continue;
      }

      const spawnDistance = spawnDistances.get(candidateKey) ?? 0;
      let spacingDistance = spawnDistance;

      for (const chosen of selected) {
        const chosenKey = keyForPoint(chosen);
        let distanceMap = selectedDistances.get(chosenKey);
        if (!distanceMap) {
          distanceMap = computeDistances(maze, chosen);
          selectedDistances.set(chosenKey, distanceMap);
        }
        spacingDistance = Math.min(spacingDistance, distanceMap.get(candidateKey) ?? 0);
      }

      const score = spawnDistance * 3 + spacingDistance * 2;
      const tieBreaker = tieBreakers.get(candidateKey) ?? 0;
      if (score > bestScore || (score === bestScore && tieBreaker > bestTieBreaker)) {
        bestPoint = candidate;
        bestScore = score;
        bestTieBreaker = tieBreaker;
      }
    }

    if (!bestPoint) {
      break;
    }

    selected.push(bestPoint);
    selectedKeys.add(keyForPoint(bestPoint));
  }

  return selected;
}

export function getCell(maze: MazeLevel, x: number, y: number) {
  return maze.cells[indexFor(wrap(x, maze.width), wrap(y, maze.height), maze.width)];
}

export function isDirectionOpen(maze: MazeLevel, x: number, y: number, direction: Direction): boolean {
  return (getCell(maze, x, y).walls & DIRECTION_TO_WALL[direction]) === 0;
}

export function traversableExits(maze: MazeLevel, x: number, y: number): Direction[] {
  return (["north", "east", "south", "west"] as Direction[]).filter((direction) =>
    isDirectionOpen(maze, x, y, direction),
  );
}

export function levelSeed(sessionSeed: number, levelIndex: number): number {
  return (sessionSeed + Math.imul(levelIndex + 1, GOLDEN_RATIO_32)) >>> 0;
}

export function generateToroidalMaze(levelIndex: number, seed: number): MazeLevel {
  const { x: width, y: height } = levelDimensions(levelIndex);
  const rng = createRng(seed);

  const cells = Array.from({ length: width * height }, () => ({ walls: ALL_WALLS }));
  const edges: Edge[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      edges.push({
        a: { x, y },
        b: { x: wrap(x + 1, width), y },
      });
      edges.push({
        a: { x, y },
        b: { x, y: wrap(y + 1, height) },
      });
    }
  }

  shuffle(edges, rng);

  const unionFind = new UnionFind(width * height);
  for (const edge of edges) {
    const aIndex = indexFor(edge.a.x, edge.a.y, width);
    const bIndex = indexFor(edge.b.x, edge.b.y, width);
    if (unionFind.union(aIndex, bIndex)) {
      openPassage(cells, width, height, edge.a, edge.b);
    }
  }

  const maze: MazeLevel = {
    width,
    height,
    cells,
    spawn: { x: 0, y: 0 },
    cheeses: [],
    levelIndex,
    seed,
  };

  const farthest = findFarthestCell(maze, maze.spawn);
  maze.cheeses = pickCheeseCells(maze, rng, CHEESE_COUNT);
  if (!maze.cheeses.some((point) => point.x === farthest.x && point.y === farthest.y)) {
    maze.cheeses[0] = farthest;
  }
  return maze;
}
