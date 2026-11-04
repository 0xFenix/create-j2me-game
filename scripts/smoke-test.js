// Reproducible cross-platform smoke test: scaffold with --yes and assert outputs.
// No prompts, no shell, no OS-specific commands. Usage: npm run smoke
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PKG_DIR = fileURLToPath(new URL('../', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PKG_VERSION = JSON.parse(await fs.readFile(path.join(PKG_DIR, 'package.json'), 'utf8')).version;
const failures = [];

function check(cond, message) {
  if (cond) {
    console.log(`ok: ${message}`);
  } else {
    failures.push(message);
    console.error(`FAIL: ${message}`);
  }
}

function runCmd(args, env) {
  // Tests never hit the network: the self-update check is always off here.
  const childEnv = { ...process.env, CREATE_J2ME_GAME_NO_UPDATE_CHECK: '1', ...env };
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(PKG_DIR, 'index.js'), ...args],
      { env: childEnv },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`command exited ${err.code}\n${stdout}\n${stderr}`));
        else resolve(stdout);
      },
    );
  });
}

function runScaffold(targetDir, extra = [], env) {
  return runCmd([targetDir, '--yes', ...extra], env);
}

async function findJavaFiles(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await findJavaFiles(abs, out);
    else if (entry.name.endsWith('.java')) out.push(abs);
  }
  return out;
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'create-j2me-game-'));
  const target = path.join(tmp, 'smoke-game');
  try {
    await runScaffold(target);
    check(true, 'scaffold exits 0');

    const read = (rel) => fs.readFile(path.join(target, rel), 'utf8');
    const exists = async (rel) => {
      try {
        await fs.stat(path.join(target, rel));
        return true;
      } catch {
        return false;
      }
    };

    for (const rel of ['build.xml', 'build.properties', 'MANIFEST.MF', '.gitignore']) {
      check(await exists(rel), `${rel} exists`);
    }

    const props = await read('build.properties');
    check(props.includes('project.output=smoke-game'), 'project.output derived from dir name');
    check(props.includes('common.dir=${user.home}/.j2me-build-common'), 'common.dir references the per-machine shared copy');

    const descriptor = await read('MANIFEST.MF');
    check(descriptor.includes('MIDlet-1: smoke-game, /icon.png, com.example.game.SmokeGameMIDlet'), 'descriptor filled');
    check(!/__[A-Z_]+__/.test(descriptor + props + (await read('build.xml'))), 'no leftover __TOKENS__');
    const raw = await fs.readFile(path.join(target, 'MANIFEST.MF'));
    check(raw[raw.length - 1] === 0x0a && raw[raw.length - 2] === 0x0a, 'descriptor keeps trailing blank line');

    const javaFiles = await findJavaFiles(path.join(target, 'src'));
    check(javaFiles.length === 1 && javaFiles[0].endsWith('SmokeGameMIDlet.java'), 'stub MIDlet generated');
    check((await read(path.relative(target, javaFiles[0]))).includes('package com.example.game;'), 'stub package correct');

    const icon = await fs.readFile(path.join(target, 'res', 'icon.png'));
    check(icon.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', 'icon.png is a valid PNG');
    check(!(await exists('tools')), 'no private copy bundled into project');
    check(await exists('ext-libs'), 'ext-libs dir scaffolded');
    const existsPkg = async (rel) => {
      try {
        await fs.stat(path.join(PKG_DIR, rel));
        return true;
      } catch {
        return false;
      }
    };
    check(await existsPkg(path.join('common', 'common.xml')), 'payload common.xml shipped');
    check(await existsPkg(path.join('common', 'libs', 'midpapi20.jar')), 'payload libs shipped');
    check(await existsPkg(path.join('common', 'tools', 'proguard-4.4.jar')), 'payload proguard shipped');
    const shippedCommon = await fs.readFile(path.join(PKG_DIR, 'common', 'common.xml'), 'utf8');
    check(shippedCommon.includes('extra.libs.jars'), 'payload common.xml defines extra.libs.jars');
    check(shippedCommon.includes('merge-extra-libs'), 'payload common.xml merges extra libs');
    const shippedProps = await fs.readFile(path.join(PKG_DIR, 'template', 'build.properties'), 'utf8');
    check(shippedProps.includes('extra.libs.dir=ext-libs'), 'payload build.properties documents extra.libs.dir');

    // Scenario 1b: `install` populates ~/.j2me-build-common (fake HOME, real one untouched).
    const fakeHome = path.join(tmp, 'fake-home');
    await fs.mkdir(fakeHome, { recursive: true });
    await runCmd(['install'], { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome });
    const existsHome = async (rel) => {
      try {
        await fs.stat(path.join(fakeHome, '.j2me-build-common', rel));
        return true;
      } catch {
        return false;
      }
    };
    check(await existsHome('common.xml'), 'install puts common.xml in ~/.j2me-build-common');
    check(await existsHome(path.join('libs', 'midpapi20.jar')), 'install puts libs in ~/.j2me-build-common');
    check(await existsHome(path.join('tools', 'proguard-4.4.jar')), 'install puts proguard in ~/.j2me-build-common');
    const stamp = await fs.readFile(path.join(fakeHome, '.j2me-build-common', '.version'), 'utf8');
    check(stamp.trim() === PKG_VERSION, 'install stamps the shared copy with the tool version');

    // Scenario 1c: a stale shared copy warns to re-run install.
    const staleHome = path.join(tmp, 'stale-home');
    const staleShared = path.join(staleHome, '.j2me-build-common');
    await fs.mkdir(staleShared, { recursive: true });
    await fs.copyFile(path.join(PKG_DIR, 'common', 'common.xml'), path.join(staleShared, 'common.xml'));
    await fs.writeFile(path.join(staleShared, '.version'), '0.0.0\n');
    const staleOut = await runScaffold(path.join(tmp, 'stale-game'), [], { ...process.env, HOME: staleHome, USERPROFILE: staleHome });
    check(staleOut.includes("re-run 'create-j2me-game install'"), 'stale shared copy warns to re-run install');

    // Scenario 2: --no-manifest skips MANIFEST.MF, stub and icon.
    const bare = path.join(tmp, 'bare-game');
    await runScaffold(bare, ['--no-manifest']);
    const existsBare = async (rel) => {
      try {
        await fs.stat(path.join(bare, rel));
        return true;
      } catch {
        return false;
      }
    };
    check(await existsBare('build.xml'), '--no-manifest keeps build.xml');
    check(await existsBare('build.properties'), '--no-manifest keeps build.properties');
    check(!(await existsBare('MANIFEST.MF')), '--no-manifest skips MANIFEST.MF');
    check(!(await existsBare('res/icon.png')), '--no-manifest skips icon');
    const bareJava = await findJavaFiles(path.join(bare, 'src')).catch(() => []);
    check(bareJava.length === 0, '--no-manifest skips stub');
    check(!(await existsBare('tools')), '--no-manifest bundles nothing');
    check(await existsBare('ext-libs'), '--no-manifest still scaffolds ext-libs');
    const bareProps = await fs.readFile(path.join(bare, 'build.properties'), 'utf8');
    check(bareProps.includes('common.dir=${user.home}/.j2me-build-common'), '--no-manifest references the shared copy');

    // Scenario 3: --common-dir opts out of the bundled copy.
    const ext = path.join(tmp, 'ext-game');
    await runScaffold(ext, ['--common-dir', REPO_ROOT, '--no-manifest']);
    const existsExt = async (rel) => {
      try {
        await fs.stat(path.join(ext, rel));
        return true;
      } catch {
        return false;
      }
    };
    const extProps = await fs.readFile(path.join(ext, 'build.properties'), 'utf8');
    check(
      extProps.includes(`common.dir=${REPO_ROOT.replace(/\\/g, '/').replace(/\/$/, '')}`),
      '--common-dir flag wins',
    );
    check(!(await existsExt('tools')), '--common-dir copies nothing');
  } catch (err) {
    failures.push(String(err?.message ?? err));
    console.error(`FAIL: ${failures[failures.length - 1]}`);
    console.error(`inspect: ${tmp}`);
    process.exitCode = 1;
    return;
  }

  if (failures.length > 0) {
    console.error(`inspect: ${tmp}`);
    process.exitCode = 1;
    return;
  }
  await fs.rm(tmp, { recursive: true, force: true });
  console.log('smoke test passed.');
}

main();
