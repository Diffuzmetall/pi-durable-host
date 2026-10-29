import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { resolve, relative, isAbsolute } from 'node:path';

/** Provider-owned implementation, supplied by the trusted host adapter. No Pi context shim. */
export interface AntigravityOperations {
 /** Explicit provider-owned credential capability; never a caller-supplied token. */
 resolveApiKey?: (context: Context) => Promise<string>;
 search(input: {apiKey: string; query: string; instruction?: string; urls?: string[]; thinking?: boolean; signal?: AbortSignal}): Promise<string>;
 image(input: {apiKey: string; cwd: string; prompt: string; aspectRatio?: string; model?: string; path?: string; signal?: AbortSignal}): Promise<{text: string[]; savedPaths: string[]; images: Array<{data: string; mimeType: string}>; model: string}>;
}

function redact(text: string, key: string) {
 for (const secret of new Set([key, JSON.stringify(key).slice(1, -1)])) text = text.split(secret).join('[REDACTED]');
 return text.replace(/\bauthorization\s*[:=]\s*[^\r\n]+/gi, 'Authorization: [REDACTED]')
  .replace(/\bbearer\s+[^\s<>"']+/gi, 'Bearer [REDACTED]');
}

export default function createAntigravityTools(operations: AntigravityOperations) {
 const auth = async (context: Context) => {
  if(operations.resolveApiKey) {
   context.abortSignal?.throwIfAborted();
   let key: string;
   try { key = await operations.resolveApiKey(context); }
   catch { throw new Error('Antigravity provider credentials unavailable.'); }
   context.abortSignal?.throwIfAborted();
   if(!key) throw new Error('Antigravity provider credentials unavailable.');
   return key;
  }
  throw new Error('Antigravity provider credentials unavailable; configure the trusted resolver first.');
 };
 return defineExtension({name: 'antigravity-tools', tools: [
  defineTool({name: 'google_search', description: 'Search Google through the host Antigravity provider and return grounded sources.',
   parameters: Type.Object({query: Type.String({minLength: 1}), instruction: Type.Optional(Type.String()), urls: Type.Optional(Type.Array(Type.String())), thinking: Type.Optional(Type.Boolean())}, {additionalProperties:false}),
   replay:'unsafe', execute: async (args, api, context) => {
    const apiKey = await auth(context);
    try { return {output:[{type:'text',text:redact(await operations.search({...args,apiKey,signal:context.abortSignal}), apiKey)}]}; }
    catch { throw new Error('Antigravity search failed; provider or network unavailable.'); }
   }}),
  defineTool({name: 'generate_image', description: 'Generate an image through the host Antigravity provider, saving in the calling workspace.',
   parameters: Type.Object({prompt:Type.String({minLength:1}), aspectRatio:Type.Optional(Type.String()), model:Type.Optional(Type.String()), path:Type.Optional(Type.String())}, {additionalProperties:false}),
   replay:'unsafe', execute:async(args,api,context)=>{
    const apiKey=await auth(context); const agent=await api.agent(context);
    if(!agent.cwd) throw new Error('Image generation requires a workspace.');
    if(args.path) {
     const delta = relative(resolve(agent.cwd), resolve(agent.cwd, args.path));
     if(delta === '..' || delta.startsWith('../') || isAbsolute(delta)) throw new Error('Image output must remain within the calling workspace.');
    }
    try { const result=await operations.image({...args,apiKey,cwd:agent.cwd,signal:context.abortSignal});
     return {output:[{type:'text',text:redact(`Saved image: ${result.savedPaths.join(', ')}. ${result.text.join(' ')}`,apiKey)},...result.images.map(image=>({type:'image' as const,...image}))]};
    } catch { throw new Error('Antigravity image generation failed; provider or network unavailable.'); }
   }}),
 ]});
}
