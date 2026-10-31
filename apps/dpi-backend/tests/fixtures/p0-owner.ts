import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Store, type SessionRow } from "../../src/store.js";

const [dataDir, cwd, serialized] = process.argv.slice(2);
const row = JSON.parse(serialized) as SessionRow;
const store = await Store.open({ dataDir, startDirs: [cwd], name: "owner-fixture", provider: "faux" });
// Independent catalogs force the contention onto the session lock, not the catalog lock.
store.catalog.prepare("INSERT INTO sessions(id,name,cwd,dbPath,createdAt,model,provider) VALUES(?,?,?,?,?,?,?)")
  .run(row.id, row.name, row.cwd, row.dbPath, row.createdAt, row.model, row.provider);
store.catalog.prepare("INSERT INTO session_profiles VALUES(?,?)").run(row.id, "playground@1");
process.send?.({ phase: "ready" });
process.on("message", async (message) => {
  if (message !== "open") return;
  try {
    const harness = await store.openAgent(row);
    const root = await harness.root(BACKGROUND_CONTEXT);
    process.send?.({ phase: "acquired", conversationId: root.id });
  } catch (error) {
    process.send?.({ phase: "rejected", error: String(error) });
    await store.close();
    process.disconnect?.();
  }
});
