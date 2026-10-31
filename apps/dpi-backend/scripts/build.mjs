import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist', 'dpi-backend');
await cp(join(root, 'prompts'), join(output, 'prompts'), { recursive: true });

// TypeScript emits runtime TS and declarations. Preserve the actual localized JS/metadata/license closure too.
async function assets(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) await assets(from, to);
    else if (!entry.name.endsWith('.ts')) await cp(from, to);
  }
}
await assets(join(root, 'src', 'native-profile'), join(output, 'src', 'native-profile'));
