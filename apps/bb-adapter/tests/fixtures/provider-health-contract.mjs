// Test-only verbatim schema excerpts; see SOURCE.json and CORE-LICENSE.txt.
import { z as z32 } from "zod";
var providerHealthSchema = z32.object({
  status: z32.enum([
    "ready",
    "not_installed",
    "unauthenticated",
    "expired",
    "unsupported_version",
    "unknown"
  ]),
  statusMessage: z32.string().min(1).nullable(),
  accountEmail: z32.string().nullable(),
  planLabel: z32.string().min(1).nullable(),
  installedVersion: z32.string().min(1).nullable(),
  minimumSupportedVersion: z32.string().min(1).nullable(),
  canInstall: z32.boolean(),
  canUpdate: z32.boolean(),
  loginCommand: z32.string().min(1).nullable(),
  localLoginCommand: z32.string().min(1).nullable().optional()
}).passthrough();
var providerHealthResultSchema = z32.discriminatedUnion("supported", [
  z32.object({ supported: z32.literal(false) }).passthrough(),
  z32.object({
    supported: z32.literal(true),
    health: providerHealthSchema
  }).passthrough()
]);
export { providerHealthSchema, providerHealthResultSchema };
