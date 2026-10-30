# Native metadata-only tracing

Derived from pi-durable-extensions `packages/langfuse/src/index.mjs`, selected runtime release `20261028-4rmMfRfc`, targeting Pi Durable 1.4.0. Copyright (c) 2026 Diffuzmetall; MIT license retained here.

The original generation/tool hooks and lifecycle are retained. This host requires an explicitly supplied session-local SDK: ambient configuration, credential discovery and automatic SDK loading were removed. No message, tool argument, result or exception payload is captured.
