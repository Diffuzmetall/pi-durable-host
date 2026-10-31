import { defineDocFamily } from '@earendil-works/pi-durable';
import { record, string, type Json } from './domain.js';
import type { TargetRef } from './read-domain.js';
export type ControlCapability = { read: true; control: boolean; actions: string[]; reason?: string; scope?: string; revision?: string; jobId?: string };
export const CONTROL_OPERATIONS = ['controls::inspect', 'subagents::spawn', 'subagents::send', 'subagents::stop', 'supervisor::reply', 'conversations::follow_up', 'conversations::steer'] as const;
export type ControlOperation = typeof CONTROL_OPERATIONS[number];
export type ControlPolicy = { revision: string; active: boolean; existing: readonly number[] };
export type ControlOwner = { controlPolicy?: () => ControlPolicy };
export function parseControlPolicy(value: unknown): ControlPolicy {
  const p = record(value);
  if (Object.keys(p).sort().join(',') !== 'active,existing,revision' || typeof p.active !== 'boolean' || !Array.isArray(p.existing) || p.existing.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(p.existing).size !== p.existing.length) throw Error('INVALID_CONTROL_POLICY');
  return { revision: string(p.revision, 256), active: p.active, existing: p.existing as number[] };
}
/** Binding command routing/intent index; native owner receipts, not this index, determine child outcome. */
export const MachineCommands = defineDocFamily<{ commands: Record<string, { parentId: number; fingerprint: string; kind: 'child' | 'input' | 'recovery'; operation: string; payload: Json; receipt?: Json }> }, null>({
  kind: 'durable-pi.machine-controls', version: 1, scope: 'session', family: true, checkpointWhen: () => false, initial: () => ({ commands: {} }) });
export interface ChildControlPort {
  execute(operation: ControlOperation, value: Json): Promise<unknown>;
  capabilities(target: TargetRef): Promise<ControlCapability>;
  get(controlId: string): Promise<unknown | null>;
  reconcile(): Promise<void>;
  close(): void;
}
export function controlFormat(operation: ControlOperation) {
  const properties: Record<string, unknown> = { target: { type: 'object' } };
  if (operation !== 'controls::inspect') Object.assign(properties, { controlId: { type: 'string', minLength: 1, maxLength: 128 }, expectedRevision: { type: 'string', minLength: 64, maxLength: 64 } });
  if (operation === 'subagents::spawn') Object.assign(properties, { name: { type: 'string', minLength: 1, maxLength: 64 }, task: { type: 'string', minLength: 1, maxLength: 65536 }, tools: { type: 'array', items: { type: 'string' }, uniqueItems: true } });
  if (operation === 'subagents::send') Object.assign(properties, { task: { type: 'string', minLength: 1, maxLength: 65536 }, mode: { type: 'string', enum: ['followUp', 'steer'] } });
  if (operation === 'subagents::stop') properties.scope = { type: 'string', enum: ['child-tree'] };
  if (operation === 'supervisor::reply') Object.assign(properties, { replyTo: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1, maxLength: 32768 } });
  if (operation.startsWith('conversations::')) properties.content = { type: 'string', minLength: 1, maxLength: 32768 };
  return { type: 'object' as const, properties, required: Object.keys(properties).filter(key => key !== 'tools'), additionalProperties: false };
}
