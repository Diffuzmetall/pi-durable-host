import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { attachGippity } from './integration.mjs';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';

/** Wrap the installed profile; backend, Models, Harness and storage remain its owners. */
export async function createOperationalProfile(options) {
  if (!process.env.GIPPITY_CONFIG) throw Error('GIPPITY_CONFIG_REQUIRED');
  const config = JSON.parse(await readFile(process.env.GIPPITY_CONFIG, 'utf8'));
  const { createOperationalProfile: createBase } = await import(pathToFileURL(config.baseProfile).href);
  const base = await createBase(options);
  return Object.assign(async context => {
    const composition = await base(context);
    try {
      return await attachGippity(composition, context, config);
    } catch (error) {
      // The base factory transferred ownership here, but Store has no object yet.
      const errors = [error];
      try { await composition.shutdown?.(BACKGROUND_CONTEXT); } catch (failure) { errors.push(failure); }
      try { await composition.cleanup?.(BACKGROUND_CONTEXT); } catch (failure) { errors.push(failure); }
      if (errors.length > 1) throw new AggregateError(errors, 'GipPity profile creation and cleanup failed', { cause: error });
      throw error;
    }
  }, base);
}
