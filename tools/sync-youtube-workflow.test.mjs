import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFRESH_AFTER_DAYS } from '../src/youtube/catalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(ROOT, path), 'utf8');
const workflow = read('docs/workflows/sync-youtube.yml');

function triggerBlockOf(text) {
  const start = text.indexOf('\non:');
  const end = text.indexOf('\npermissions:', start);
  assert.notEqual(start, -1, 'workflow must declare its event triggers');
  assert.notEqual(end, -1, 'workflow must declare permissions after its triggers');
  return text.slice(start + '\non:'.length, end);
}

test('catalogue file path is tracked input to the same Vite build used by Vercel', () => {
  const catalogPath = 'src/data/youtube/matt-mez-sax.json';
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--quiet', catalogPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(ignored.status, 1, `${catalogPath} must not be ignored by Git`);
  assert.match(read('.gitignore'), /Intentionally versioned public YouTube metadata/);

  const syncTool = read('tools/sync-youtube.mjs');
  assert.match(syncTool, /resolve\(ROOT, 'src\/data\/youtube', `\$\{slug\}\.json`\)/);

  const loader = read('src/catalog.js');
  assert.match(loader, /import\.meta\.glob\('\.\/data\/youtube\/\*\.json',\s*\{\s*eager:\s*true/);

  const packageJson = JSON.parse(read('package.json'));
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.framework, 'vite');
  assert.equal(vercel.installCommand, 'npm ci');
  assert.equal(vercel.buildCommand, 'npm run build');
  assert.equal(vercel.outputDirectory, 'dist');
  assert.equal(packageJson.scripts.build, 'vite build');
});

test('workflow template is manual and weekly on main, with no PR or push trigger', () => {
  const triggers = triggerBlockOf(workflow);
  assert.match(triggers, /^\s+workflow_dispatch:\s*$/m);
  assert.match(triggers, /^\s+schedule:\s*$/m);
  assert.match(triggers, /cron: '17 5 \* \* 1'/);
  assert.doesNotMatch(triggers, /^\s+(?:push|pull_request|pull_request_target|pull_request_review):/m);
  assert.match(workflow, /if: github\.repository == 'mattmezstitchlab\/RELIA' && github\.ref == 'refs\/heads\/main'/);

  const concurrency = workflow.match(/^concurrency:\n([\s\S]*?)^jobs:/m)?.[1] || '';
  assert.match(concurrency, /group: youtube-catalog-\$\{\{ github\.repository \}\}/);
  assert.match(concurrency, /cancel-in-progress: false/);
});

test('both official handles use the existing full sync in one identity catalogue', () => {
  const syncCommands = workflow.match(/node tools\/sync-youtube\.mjs/g) || [];
  assert.equal(syncCommands.length, 2, 'the workflow must resolve both channels via the official API');
  assert.match(workflow, /https:\/\/www\.youtube\.com\/@mezofon\/videos/);
  assert.match(workflow, /https:\/\/www\.youtube\.com\/@mattmezsax\/videos/);
  assert.equal((workflow.match(/--identity relia:person:matt-mez-sax/g) || []).length, 2);
  assert.equal((workflow.match(/--require-complete/g) || []).length, 2);
  const syncTool = read('tools/sync-youtube.mjs');
  assert.match(syncTool, /'require-complete':\s*\{\s*type: 'boolean'/);
  assert.match(syncTool, /args\['require-complete'\]/);
  assert.match(syncTool, /écriture annulée afin de ne pas conserver des métadonnées expirées/);
  assert.doesNotMatch(workflow, /--since/);
  assert.doesNotMatch(workflow, /--out/);
  assert.equal(REFRESH_AFTER_DAYS, 30);
});

test('API secret stays in step environments and results are proposed for review, never deployed', () => {
  assert.match(workflow, /YOUTUBE_API_KEY:\s*\$\{\{ secrets\.YOUTUBE_API_KEY \}\}/);
  assert.match(workflow, /if \[ -z "\$YOUTUBE_API_KEY" \]/);
  assert.match(workflow, /--max-pages 200/);
  assert.match(workflow, /gh pr create/);
  assert.match(workflow, /gh pr edit/);
  assert.match(workflow, /automation\/youtube-catalog/);
  assert.doesNotMatch(workflow, /gh pr merge|--auto|VERCEL_TOKEN|vercel deploy/i);
});
