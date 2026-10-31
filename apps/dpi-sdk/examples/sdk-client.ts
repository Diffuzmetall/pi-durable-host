// Source-checkout recipe. Run with Node + tsx; imports only the public SDK client.
import { DpiClient } from "../src/client.js";

async function main() {
  const required = (key: string) => {
    const value = process.env[key];
    if (!value?.trim()) throw Error(`Missing ${key}`);
    return value;
  };
  const url = new URL(required("DPI_URL"));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("Use an HTTP(S) host URL without credentials");
  const token = required("DPI_TOKEN");
  const key = required("DPI_REQUEST_KEY");
  if (key.length > 110) throw Error("DPI_REQUEST_KEY must be at most 110 characters");
  const cwd = required("DPI_CWD");
  const provider = required("DPI_MODEL_PROVIDER");
  const modelId = required("DPI_MODEL_ID");
  const prompt = process.env.DPI_PROMPT ?? "Hello from the SDK recipe";
  const client = new DpiClient(url.href.replace(/\/$/, ""), token);
  // Persist DPI_REQUEST_KEY before the first run; use the same inputs for lost-ACK retries.
  const session = await client.createSession({ name: "SDK recipe", cwd, model: { provider, modelId } }, `${key}:session`);
  let result = await client.agent(session.id, "main").send(prompt, "followUp", `${key}:submit`);
  for (let attempts = 0; attempts < 30 && (result.status === "pending" || result.status === "queued"); attempts++)
    result = await client.session(session.id).submission(result.submissionId, 1000);
  if (result.status !== "done") throw Error("No terminal answer yet; rerun with the same key, do not invent a new submission");
  console.log(JSON.stringify({ sessionId: session.id, submissionId: result.submissionId, status: result.status, answer: result.answer.text }));
}

main().catch(() => {
  // A server/network error can contain private input; never dump it or credentials to a client log.
  console.error("SDK recipe failed. Check the documented environment and host availability; retry unchanged inputs with the same DPI_REQUEST_KEY.");
  process.exitCode = 1;
});
