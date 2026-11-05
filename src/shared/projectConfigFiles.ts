import * as fs from 'node:fs';
import * as path from 'node:path';

export const projectConfigGlob = '**/openedge-project.{json,jsonc}';

export function findProjectConfigFile(directory: string): string | undefined {
  for (const name of ['openedge-project.jsonc', 'openedge-project.json']) {
    const filename = path.join(directory, name);
    if (fs.existsSync(filename)) return filename;
  }
  return undefined;
}