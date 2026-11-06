import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const UTILS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'src', 'utils');
const PREFIX = '/opt/nodejs/utils/';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(PREFIX)) {
    const file = specifier.slice(PREFIX.length).replace(/\.js$/, '.ts');
    return nextResolve(pathToFileURL(join(UTILS_DIR, file)).href, context);
  }
  return nextResolve(specifier, context);
}
