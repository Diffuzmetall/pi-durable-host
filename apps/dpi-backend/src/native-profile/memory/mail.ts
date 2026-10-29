import { pathToFileURL } from 'node:url';
import { McpClient, type McpTransport } from '@earendil-works/pi-mcp';
import type { McpCodemodeOptions } from '../guards/mcp-codemode.js';

/** Actual selected native authorizeAgentMail policy, without the global environment callback. */
export function authorizeAgentMail(name: string, args: Record<string, unknown>, project: string, agent: string): void {
  if (args.project_key !== undefined && args.project_key !== project) throw new Error('Agent Mail project mismatch');
  if (args.human_key !== undefined && args.human_key !== project) throw new Error('Agent Mail project mismatch');
  const actor: Record<string, string> = {
    register_agent: 'name', send_message: 'sender_name', reply_message: 'sender_name',
    request_contact: 'from_agent', respond_contact: 'to_agent', macro_start_session: 'agent_name',
    macro_prepare_thread: 'agent_name', macro_file_reservation_cycle: 'agent_name', macro_contact_handshake: 'agent_name',
    fetch_inbox: 'agent_name', fetch_inbox_events: 'agent_name', mark_all_read: 'agent_name',
    mark_message_read: 'agent_name', acknowledge_message: 'agent_name', list_contacts: 'agent_name',
    set_contact_policy: 'agent_name', unretire_agent: 'agent_name', acquire_build_slot: 'agent_name',
    renew_build_slot: 'agent_name', release_build_slot: 'agent_name', file_reservation_paths: 'agent_name',
    release_file_reservations: 'agent_name', renew_file_reservations: 'agent_name', check_file_reservation_conflicts: 'agent_name',
    fetch_inbox_product: 'agent_name', retire_agent: 'agent_name', deregister_agent: 'agent_name', force_release_file_reservation: 'agent_name',
  };
  const key = actor[name];
  if (key && args[key] !== agent) throw new Error(`Agent Mail identity mismatch: ${key} must be ${agent}`);
  if (['deregister_agent', 'force_release_file_reservation', 'cleanup_pane_identities', 'install_precommit_guard',
    'uninstall_precommit_guard', 'retire_agent', 'create_agent_identity'].includes(name))
    throw new Error(`Agent Mail ${name} requires separate operator approval`);
}

/** Explicit session-owned transport and already-admitted identity. This does not register a real agent or read MCP config. */
export async function openSessionMail(options: {
  project: string;
  agent: string;
  registrationToken?: string;
  allowedTools: readonly string[];
  transport(env: Readonly<Record<string, string>>): McpTransport;
  authorize: () => void | Promise<void>;
}) {
  if (!options.project || !options.agent || typeof options.authorize !== 'function') throw Error('Explicit session Mail identity and current grant are required');
  const identity = Object.freeze({ project: options.project, name: options.agent });
  const shellEnv = Object.freeze({ AGENT_MAIL_AGENT: identity.name, AGENT_MAIL_PROJECT: identity.project });
  const client = new McpClient({ name: 'pi-durable-host', version: '0.1.0', roots: [{ uri: pathToFileURL(identity.project).href, name: 'workspace' }] });
  let closed = false;
  try {
    await options.authorize();
    await client.connect(options.transport(shellEnv));
    const available = await client.listTools();
    if (!options.allowedTools.length || options.allowedTools.some(name => !available.some(tool => tool.name === name)))
      throw Error('Agent Mail approved tool inventory is unavailable');
    const source: McpCodemodeOptions = {
      server: 'mcp-agent-mail', client, allowedTools: [...options.allowedTools], directTools: [],
      authorize: async (tool, args) => {
        if (closed) throw Error('Session Agent Mail is closed');
        await options.authorize();
        authorizeAgentMail(tool.name, args, identity.project, identity.name);
        if (options.registrationToken && (tool.name === 'send_message' || tool.name === 'reply_message')) args.sender_token = options.registrationToken;
      },
    };
    return { source, identity, shellEnv, async close() { if (!closed) { closed = true; await client.close(); } } };
  } catch (error) {
    await client.close();
    throw error;
  }
}
