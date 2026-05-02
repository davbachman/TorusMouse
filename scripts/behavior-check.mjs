import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.PORT ?? 4176);
const url = `http://127.0.0.1:${port}/`;

function startServer() {
  const child = spawn(
    "npm",
    ["exec", "vite", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function readState(page) {
  const raw = await page.evaluate(() => window.render_game_to_text?.());
  assert.equal(typeof raw, "string", "window.render_game_to_text() should return JSON text");
  return JSON.parse(raw);
}

const server = startServer();
let browser;

try {
  await waitForServer();

  browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(message.text());
    }
  });
  await page.goto(url);
  try {
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  } catch (error) {
    throw new Error(`Game test hook did not load. Browser errors: ${pageErrors.join(" | ") || "none"}`, {
      cause: error,
    });
  }

  const initial = await readState(page);
  assert.ok(initial.torus?.wallSegments > 0, "torus wall segments should be exposed for verification");
  assert.ok(initial.cats?.total > 0, "level should include chasing cats");
  assert.ok(
    Array.isArray(initial.cats?.positions) && initial.cats.positions.length === initial.cats.total,
    "text state should list active cat positions",
  );
  assert.ok(initial.cats.speed > 0 && initial.cats.speed < 1.6, "cats should move slowly");

  const catsVisibleInTorus = await page.evaluate(() => {
    const gameText = window.render_game_to_text?.();
    return Boolean(gameText && JSON.parse(gameText).torus?.showsCats);
  });
  assert.equal(catsVisibleInTorus, false, "cats should not be shown in the torus overview");

  await page.keyboard.press("Space");
  const beforeChase = await readState(page);
  await page.evaluate(async () => window.advanceTime?.(1600));
  const afterChase = await readState(page);
  const movedDistance = Math.hypot(
    afterChase.cats.positions[0].x - beforeChase.cats.positions[0].x,
    afterChase.cats.positions[0].y - beforeChase.cats.positions[0].y,
  );
  assert.ok(movedDistance > 0.08, "cat should move while game time advances");
  assert.ok(movedDistance < 3.2, "cat should move relatively slowly");

  await page.evaluate(() => window.move_player_to_cat_for_test?.());
  const lost = await readState(page);
  assert.equal(lost.mode, "lost", "colliding with a cat should immediately end the game");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
