import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPackage = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const functionsDir = join(__dirname, '../dist/functions');
const functionDirs = readdirSync(functionsDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

for (const funcName of functionDirs) {
  const packageJson = {
    name: `eecar-${funcName}`,
    version: '1.0.0',
    type: 'module',
    dependencies: rootPackage.dependencies
  };

  const packagePath = join(functionsDir, funcName, 'package.json');
  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  console.log(`Created package.json for ${funcName}`);
}

// 자동이가 운영 중인 코드를 조회할 수 있게 소스를 패키지에 함께 넣는다 (DECISION_LOG E-41)
const snapshotDir = join(functionsDir, 'slack-agent', 'source-snapshot');
mkdirSync(join(snapshotDir, 'infrastructure'), { recursive: true });
cpSync(join(__dirname, '../src'), join(snapshotDir, 'backend/src'), { recursive: true, filter: source => !source.includes('prompts') });
copyFileSync(join(__dirname, '../../infrastructure/template.yaml'), join(snapshotDir, 'infrastructure/template.yaml'));
console.log('Created source snapshot for slack-agent');
