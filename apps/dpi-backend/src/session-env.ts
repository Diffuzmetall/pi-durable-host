import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';

/** Host credentials and other sessions' identity/log variables are not a shell environment. */
export function baseShellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'TERM']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

/** SDK1.4 shellEnv overlays process.env by default; enforce the explicitly admitted session environment. */
export class SessionExecutionEnv extends NodeExecutionEnv {
  private readonly sessionEnv: Readonly<Record<string, string>>;
  constructor(options: { cwd: string; shellEnv: Readonly<Record<string, string>> }) {
    super({ cwd: options.cwd });
    this.sessionEnv = { ...options.shellEnv };
  }
  override exec(...[command, options, context]: Parameters<NodeExecutionEnv['exec']>): ReturnType<NodeExecutionEnv['exec']> {
    return super.exec(command, { ...options, inheritEnv: false, env: options?.inheritEnv === false ? options.env : { ...this.sessionEnv, ...options?.env } }, context);
  }
}
