import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { bootServer, newToken, tempStore } from "./helpers.js";

test("ISC-35/36: standalone client recipes execute and retry without leaking credentials", async () => {
  const t = await tempStore();
  const home = join(t.root, "home");
  await mkdir(home);
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  const token = newToken();
  let server: Awaited<ReturnType<typeof bootServer>> | undefined;
  try {
    server = await bootServer({ home: join(t.root, "server"), startDirs: t.work, token });
    for (const [name, loader] of [["sdk-client.ts", "tsx"], ["http-client.mjs", "node"], ["http-client.sh", "sh"]] as const) {
      const path = resolve(import.meta.dirname, "../../dpi-sdk/examples", name);
      const source = await readFile(path, "utf8");
      assert.doesNotMatch(source, /@earendil-works|(?:from|import\s*\()\s*["'][^"']*(?:store|harness|sqlite)/i);
      if (loader !== "tsx") assert.doesNotMatch(source, /(?:from|import\s*\()\s*["'][^"']*(?:dpi-sdk|client\.js)/);
      const run = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
        const child = spawn(loader === "sh" ? "sh" : process.execPath, [...(loader === "tsx" ? ["--import", "tsx"] : []), path], {
          cwd: resolve(import.meta.dirname, ".."),
          env: {
            PATH: process.env.PATH, HOME: home,
            DPI_URL: server!.base, DPI_TOKEN: token, DPI_CWD: t.work,
            DPI_REQUEST_KEY: `recipe-${name}`, DPI_PROMPT: "recipe-answer-sentinel",
            DPI_MODEL_PROVIDER: "faux", DPI_MODEL_ID: "echo",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "", stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => done({ code, stdout, stderr }));
      });
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      assert.ok(!`${first.stdout}${first.stderr}`.includes(token));
      const answer = JSON.parse(first.stdout);
      assert.equal(answer.status, "done");
      assert.match(answer.answer, /recipe-answer-sentinel/);
      const retry = await run();
      assert.equal(retry.code, 0, retry.stderr);
      assert.ok(!`${retry.stdout}${retry.stderr}`.includes(token));
      const repeated = JSON.parse(retry.stdout);
      assert.equal(repeated.sessionId, answer.sessionId);
      assert.equal(repeated.submissionId, answer.submissionId);
      assert.equal(repeated.answer, answer.answer);
    }
    assert.ok(!server.output().includes(token));
  } finally {
    await server?.stop();
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await t.cleanup();
  }
});
