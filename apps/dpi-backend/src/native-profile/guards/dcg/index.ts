/** Native host-owned execution-environment ABI, not Pi ExtensionAPI or a registry adapter. */
export const DURABLE_DCG_ABI_VERSION = 1;

export { type DcgDiagnosticOptions, formatDcgDiagnostic } from "./diagnostics.js";
export {
	createDcgEnvironmentFactory,
	type DcgEnvironmentFactory,
	type DcgEnvironmentFactoryOptions,
	type DcgEnvironmentTarget,
	DcgExecutionEnv,
	type DcgExecutionEnvOptions,
} from "./environment.js";
export {
	createDcgEvaluator,
	type DcgDecision,
	type DcgEvaluationContext,
	type DcgEvaluationInput,
	type DcgEvaluator,
	type DcgEvaluatorOptions,
} from "./evaluator.js";
