import { writeFileSync } from "node:fs";
import { Store } from "../../src/store.js";

const [home, work, marker] = process.argv.slice(2);
if (!home || !work || !marker) throw Error("fixture requires home, work and marker");
const store = await Store.open({ dataDir: home, startDirs: [work], name: "test", provider: "faux" });
const openAgent = store.openAgent.bind(store);
store.openAgent = async (row, create, thinking) => {
  const harness = await openAgent(row, create, thinking);
  writeFileSync(marker, row.id);
  process.kill(process.pid, "SIGKILL");
  return harness;
};
await store.createSessionRequest(
  { name: "once", cwd: work, model: { provider: "faux", modelId: "echo" } },
  "create-once",
  { actor: "fixture-human", source: "terminal", authority: "human", assertCurrent: () => {} },
);
throw Error("SIGKILL fixture unexpectedly survived");
