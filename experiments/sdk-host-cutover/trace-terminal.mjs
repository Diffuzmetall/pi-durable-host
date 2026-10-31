import { registerHooks } from 'node:module';
// Read-only, temporary diagnostic instrumentation; installed adapter files stay unchanged.
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (!url.endsWith('/dpi-terminal-adapter/dist/remote-controller.js')) return result;
  const source = String(result.source);
  if (!source.includes('catch (error) {')) throw Error('UNEXPECTED_ADAPTER_DIAGNOSTIC_BOUNDARY');
  return { ...result, source: `import { appendFileSync as debugAppend } from 'node:fs'; let debugErrors = 0;\n` +
    source.replaceAll('catch (error) {', `catch (error) { if (debugErrors++ < 3) debugAppend('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-control/terminal-observer-errors.log', String(error?.stack ?? error) + '\\n', { mode: 0o600 });`) };
} });
