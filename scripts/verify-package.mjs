/** Verify the published tarball in an isolated consumer, without repository overrides. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const runtimeOnly = process.argv.includes('--runtime-only');
const unexpectedArgs = process.argv.slice(2).filter((argument) => argument !== '--runtime-only');
if (unexpectedArgs.length) throw new Error(`Unknown arguments: ${unexpectedArgs.join(', ')}`);

function run(command, args, cwd, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status}, signal ${result.signal ?? 'none'})`);
  }
  return result.stdout ?? '';
}
function npm(args, cwd, options) {
  return process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, ...args], cwd, options)
    : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, options);
}
function installedVersion(name) {
  return require(`${name}/package.json`).version;
}
function verifyRuntime(cwd, esmIndex, esmReporter, cjsIndex, cjsReporter, cli) {
  const esm = `import assert from 'node:assert/strict';
    import { test, expect, defineConfig, calculateCoverage, parseSpecs } from ${JSON.stringify(esmIndex)};
    import Reporter from ${JSON.stringify(esmReporter)};
    for (const exported of [test, expect, defineConfig, calculateCoverage, parseSpecs, Reporter]) assert.equal(typeof exported, 'function');
    assert.ok(new Reporter({}));`;
  const cjs = `const assert = require('node:assert/strict');
    const api = require(${JSON.stringify(cjsIndex)});
    const Reporter = require(${JSON.stringify(cjsReporter)});
    for (const name of ['test', 'expect', 'defineConfig', 'calculateCoverage', 'parseSpecs']) assert.equal(typeof api[name], 'function');
    assert.equal(typeof Reporter, 'function'); assert.ok(new Reporter({}));`;
  run(process.execPath, ['--input-type=module', '-e', esm], cwd);
  run(process.execPath, ['--input-type=commonjs', '-e', cjs], cwd);
  for (const args of [['--help'], ['--no-pretty', '--help']]) {
    const help = run(process.execPath, [cli, ...args], cwd, { capture: true });
    assert.match(help, /playswag/i);
    assert.match(help, /merge/i);
  }
}

if (runtimeOnly) {
  // Intended for a Node runtime matrix after one build/install, not an isolated-consumer test.
  verifyRuntime(root,
    pathToFileURL(join(root, 'dist/esm/index.js')).href,
    pathToFileURL(join(root, 'dist/esm/reporter.js')).href,
    join(root, 'dist/cjs/index.cjs'), join(root, 'dist/cjs/reporter.cjs'), join(root, 'dist/esm/cli.js'));
  console.log(`Built distribution runtime imports and CLI passed on ${process.version}.`);
} else {
  const consumer = await mkdtemp(join(tmpdir(), 'playswag-package-'));
  try {
    let tarball = process.env.PLAYSWAG_TEST_TARBALL;
    if (tarball !== undefined) {
      assert.ok(isAbsolute(tarball), 'PLAYSWAG_TEST_TARBALL must be an absolute tarball path');
      await access(tarball);
      console.log(`Testing supplied tarball: ${tarball}`);
    } else {
      const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', consumer], root, { capture: true }));
      assert.equal(packed.length, 1);
      tarball = join(consumer, packed[0].filename);
    }
    const playwrightVersion = process.env.PLAYSWAG_TEST_PLAYWRIGHT_VERSION ?? installedVersion('@playwright/test');
    const manifest = {
      name: 'playswag-package-consumer', version: '1.0.0', private: true,
      dependencies: { [packageJson.name]: `file:${tarball}`, '@playwright/test': playwrightVersion },
      devDependencies: { typescript: installedVersion('typescript'), '@types/node': installedVersion('@types/node') },
    };
    await writeFile(join(consumer, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    const installedRoot = join(consumer, 'node_modules', packageJson.name);
    for (const file of ['dist/esm/index.js', 'dist/esm/reporter.js', 'dist/esm/cli.js',
      'dist/cjs/index.cjs', 'dist/cjs/reporter.cjs', 'dist/types/index.d.ts',
      'dist/types/index.d.cts', 'dist/types/reporter.d.ts', 'dist/types/reporter.d.cts']) {
      await access(join(installedRoot, file));
    }
    verifyRuntime(consumer, packageJson.name, `${packageJson.name}/reporter`, packageJson.name,
      `${packageJson.name}/reporter`, join(installedRoot, 'dist/esm/cli.js'));
    const typeConsumer = `import { test, expect, defineConfig, calculateCoverage, parseSpecs, type PlayswagConfiguration } from '${packageJson.name}';
import Reporter from '${packageJson.name}/reporter';
const config: PlayswagConfiguration = { specs: './openapi.json', schemaDepth: 3 };
defineConfig({ reporter: [['${packageJson.name}/reporter', config]], use: { playswagSpecs: './openapi.json' } });
const reporter = new Reporter(config);
const coverage = calculateCoverage([], { sources: [], operations: [] });
test('consumer', async ({ request }) => { const response = await request.get('/health'); expect(response.status()).toBe(200); });
void [reporter, coverage, parseSpecs];
`;
    await writeFile(join(consumer, 'consumer.mts'), typeConsumer);
    await writeFile(join(consumer, 'consumer.cts'), typeConsumer);
    run(process.execPath, [join(consumer, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
      '--module', 'Node16', '--moduleResolution', 'Node16', '--target', 'ES2022',
      'consumer.mts', 'consumer.cts'], consumer);
    // Audit the actual production tree a consumer receives; root overrides are not inherited.
    npm(['audit', '--omit=dev', '--audit-level=high'], consumer);
    console.log(`Packed consumer passed: ESM, CJS, CLI, TypeScript, production audit; Node ${process.version}, Playwright ${playwrightVersion}.`);
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}
