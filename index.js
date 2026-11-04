#!/usr/bin/env node
// Scaffold a new J2ME game project powered by j2me-build-common.
// Usage: npm create j2me-game@latest [directory] [options]
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import * as p from '@clack/prompts';
import c from 'picocolors';

const TEMPLATE_DIR = fileURLToPath(new URL('./template/', import.meta.url));
// Install source (common.xml, libs, proguard, microemulator) shipped inside
// this package. `create-j2me-game install` copies it to ~/.j2me-build-common
// once per machine; scaffolded projects record
// common.dir=${user.home}/.j2me-build-common, so the same string resolves on
// every machine — no per-project copy, no symlink, no env var.
const COMMON_PAYLOAD_DIR = fileURLToPath(new URL('./common/', import.meta.url));
const SHARED_DIR_NAME = '.j2me-build-common';
const SHARED_COMMON_DIR = '${user.home}/.j2me-build-common';
// 1x1 transparent PNG placeholder for res/icon.png (keeps the project buildable).
const PLACEHOLDER_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DEFAULT_DIR = 'my-j2me-game';
const DEFAULT_PACKAGE = 'com.example.game';
const DEFAULT_VERSION = '1.0.0';
const DEFAULT_VENDOR = 'MyCompany';
const DEFAULT_ICON = '/icon.png';
// Prefer JAVA_HOME when set; otherwise fall back per OS.
function defaultJdkPath() {
  const javaHome = (process.env.JAVA_HOME ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (javaHome) return javaHome;
  if (process.platform === 'darwin') return '/Library/Java/JavaVirtualMachines/jdk1.7.0_80.jdk/Contents/Home';
  if (process.platform === 'win32') return 'C:/Program Files (x86)/Java/jdk1.7.0_80';
  return '/usr/lib/jvm/jdk1.7.0_80';
}
const DEFAULT_JDK_PATH = defaultJdkPath();
const DEFAULT_JAVA = '1.4';
const PKG_VERSION = JSON.parse(await fs.readFile(new URL('./package.json', import.meta.url), 'utf8')).version;
// GitHub repo backing the self-update check (public; anonymous API is enough).
const UPDATE_REPO = '0xFenix/create-j2me-game';
const UPDATE_CACHE_FILE = 'create-j2me-game-update-check.json';
const UPDATE_CHECK_ENV = 'CREATE_J2ME_GAME_NO_UPDATE_CHECK';

function isNewerVersion(latest, current) {
  const a = String(latest).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function printUpdateNotice(latest) {
  p.note(
    `Update available: ${c.dim(PKG_VERSION)} → ${c.green(latest)}\n`
    + `  ${c.cyan(`npm i -g ${UPDATE_REPO}  `)}# update the tool\n`
    + `  ${c.cyan('create-j2me-game install')}  # then refresh ~/.j2me-build-common`,
    'Update',
  );
}

// Check the latest GitHub release once a day (cached in tmp). Silent on
// failure (offline, rate-limited): an update notice must never break a run.
// Skipped in CI and with CREATE_J2ME_GAME_NO_UPDATE_CHECK=1.
async function checkForUpdates() {
  if (process.env.CI || process.env[UPDATE_CHECK_ENV]) return;
  try {
    const cacheFile = path.join(os.tmpdir(), UPDATE_CACHE_FILE);
    const cached = await fs.readFile(cacheFile, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
    if (cached && Date.now() - cached.at < 24 * 3600 * 1000) {
      if (cached.latest && isNewerVersion(cached.latest, PKG_VERSION)) printUpdateNotice(cached.latest);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    let latest = '';
    try {
      const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'create-j2me-game', Accept: 'application/vnd.github+json' },
      });
      if (res.ok) latest = String((await res.json()).tag_name || '').replace(/^v/, '');
    } finally {
      clearTimeout(timer);
    }
    if (!latest) return;
    await fs.writeFile(cacheFile, JSON.stringify({ at: Date.now(), latest })).catch(() => {});
    if (isNewerVersion(latest, PKG_VERSION)) printUpdateNotice(latest);
  } catch {
    // never fail a scaffold/install because of the update check
  }
}

const HELP = [
  'Usage: create-j2me-game [directory] [options]',
  '       create-j2me-game install',
  '',
  'Scaffold a J2ME game project powered by j2me-build-common.',
  'Existing files are never overwritten.',
  '',
  'Arguments:',
  '  directory                Target directory (default: my-j2me-game)',
  '',
  'Commands:',
  '  install                  Install the shared build files to ~/.j2me-build-common (once per machine)',
  '',
  'Options:',
  '  --midlet-name <name>     MIDlet-Name (default: directory name)',
  '  --midlet-1-name <name>   Display name in MIDlet-1 (default: MIDlet-Name)',
  '  --vendor <name>          MIDlet-Vendor (default with --yes: MyCompany)',
  '  --midlet-version <ver>   MIDlet-Version (default: 1.0.0)',
  '  --package <pkg>          Java package (default: com.example.game)',
  '  --class <cls>            Main MIDlet class (default: <Project>MIDlet)',
  '  --icon <path>            MIDlet icon, empty to skip (default: /icon.png)',
  '  --common-dir <path>      Use an external j2me-build-common instead of the ~/.j2me-build-common shared copy',
  '  --jdk-path <path>        JDK 7 path (default: ' + DEFAULT_JDK_PATH + ')',
  '  --java-source <ver>      javac source level (default: 1.4)',
  '  --java-target <ver>      javac target level (default: 1.4)',
  '  --zkm                    Also generate ZKM.txt from the bundled example',
  '  --no-manifest            Skip MANIFEST.MF details + stub (bring your own MANIFEST.MF)',
  '  -y, --yes                Accept all defaults, skip prompts',
  '  -h, --help               Show this help',
  '',
  'Examples:',
  '  create-j2me-game install',
  '  create-j2me-game my-game',
  '  create-j2me-game my-game --yes',
  '  create-j2me-game my-game --package com.foo.game --vendor "Foo Studio" --zkm',
].join('\n');

function fail(message) {
  p.cancel(message);
  process.exit(1);
}

function onCancel() {
  p.cancel('Scaffold cancelled.');
  process.exit(1);
}

function validateDirInput(value) {
  const text = value.trim();
  if (!text) return 'Directory is required.';
  // Allow a Windows drive-letter colon (C:/...), reject ':' elsewhere.
  const withoutDrive = text.replace(/^[A-Za-z]:/, '');
  if (/[<>:"|?*\x00-\x1f]/.test(withoutDrive)) return 'Avoid these characters in the path: <>:"|?*';
  return undefined;
}

function required(label) {
  return (value) => (value.trim() ? undefined : `${label} is required.`);
}

function validateJavaPackage(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value.trim())) {
    return 'Must be a valid Java package (e.g. com.example.game).';
  }
  return undefined;
}

function validateJavaClass(value) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value.trim())) {
    return 'Must be a valid Java class name (e.g. GameMIDlet).';
  }
  return undefined;
}

function toPascalCase(name) {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const pascal = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return /^[A-Za-z_$]/.test(pascal) ? pascal : `Game${pascal}`;
}

function sanitizeOutput(name) {
  const out = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return out || 'app';
}

function normPath(value) {
  return String(value).trim().replace(/\\/g, '/');
}

async function pathExists(absPath) {
  try {
    await fs.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

function javacVersion(javacBin) {
  return new Promise((resolve) => {
    execFile(javacBin, ['-version'], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve(null);
      else resolve(`${stdout}${stderr}`.trim().split('\n')[0]);
    });
  });
}

// Install the shipped payload to ~/.j2me-build-common (once per machine).
// The directory is tool-owned, so install is a clean replace (rm + copy) —
// this also upgrades an older shared copy in place.
async function runInstall() {
  p.intro(c.bgCyan(c.black(' create-j2me-game ')));
  const home = os.homedir();
  if (!home) fail('Could not determine the home directory.');
  if (!(await pathExists(path.join(COMMON_PAYLOAD_DIR, 'common.xml')))) {
    fail('Shared payload missing in this install — reinstall create-j2me-game.');
  }
  const dest = path.join(home, SHARED_DIR_NAME);
  const spinner = p.spinner();
  spinner.start(`Installing shared build files to ${dest}...`);
  try {
    const files = [];
    async function walk(rel) {
      const entries = await fs.readdir(path.join(COMMON_PAYLOAD_DIR, rel), { withFileTypes: true });
      for (const entry of entries) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(childRel);
        else files.push(childRel);
      }
    }
    await walk('');
    await fs.rm(dest, { recursive: true, force: true });
    for (const rel of files) {
      const abs = path.join(dest, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.copyFile(path.join(COMMON_PAYLOAD_DIR, rel), abs);
    }
    // Version stamp: scaffold warns when the shared copy lags behind the tool.
    await fs.writeFile(path.join(dest, '.version'), `${PKG_VERSION}\n`);
    spinner.stop('Shared build files installed.');
    p.note(`${c.green(`Installed ${files.length} file(s) to:`)}\n  ${c.cyan(dest)}`, 'Summary');
    p.outro(`Scaffold with: ${c.cyan('create-j2me-game my-game')}`);
  } catch (err) {
    spinner.stop('Install failed.');
    fail(`Could not install: ${err.message}`);
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        yes: { type: 'boolean', short: 'y', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        'midlet-name': { type: 'string' },
        'midlet-1-name': { type: 'string' },
        vendor: { type: 'string' },
        'midlet-version': { type: 'string' },
        package: { type: 'string' },
        class: { type: 'string' },
        icon: { type: 'string' },
        'common-dir': { type: 'string' },
        'jdk-path': { type: 'string' },
        'java-source': { type: 'string' },
        'java-target': { type: 'string' },
        zkm: { type: 'boolean' },
        'no-manifest': { type: 'boolean' },
      },
    });
  } catch (err) {
    console.error(c.red(`Error: ${err.message}`));
    console.log(HELP);
    process.exit(1);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(HELP);
    return;
  }
  await checkForUpdates();
  // `install` takes no directory; a project literally named "install" must
  // be scaffolded as ./install or renamed.
  if (positionals[0] === 'install' && positionals.length === 1) {
    await runInstall();
    return;
  }

  p.intro(c.bgCyan(c.black(' create-j2me-game ')));

  // --- Target directory -------------------------------------------------
  let dirInput = positionals[0];
  if (dirInput === undefined && !values.yes) {
    const answer = await p.text({
      message: 'Project directory?',
      placeholder: DEFAULT_DIR,
      defaultValue: DEFAULT_DIR,
      validate: validateDirInput,
    });
    if (p.isCancel(answer)) onCancel();
    dirInput = answer;
  }
  dirInput = (dirInput ?? DEFAULT_DIR).trim() || DEFAULT_DIR;
  const dirError = validateDirInput(dirInput);
  if (dirError) fail(`Invalid directory: ${dirError}`);
  const targetDir = path.resolve(dirInput);
  const projectName = path.basename(targetDir) || DEFAULT_DIR;

  const dirStat = await fs.stat(targetDir).catch(() => null);
  if (dirStat && !dirStat.isDirectory()) {
    fail(`Target exists and is not a directory: ${targetDir}`);
  }
  const dirNonEmpty = dirStat ? (await fs.readdir(targetDir)).length > 0 : false;
  if (dirNonEmpty && !values.yes) {
    const go = await p.confirm({
      message: `Directory ${c.cyan(dirInput)} is not empty. Continue? (existing files are never overwritten)`,
      initialValue: false,
    });
    if (p.isCancel(go) || !go) onCancel();
  } else if (dirNonEmpty) {
    p.log.warn('Target directory is not empty. Existing files will be kept.');
  }

  // --- MANIFEST.MF: generate now, or skip and copy your own file later? --
  let genManifest;
  if (values['no-manifest'] !== undefined) {
    genManifest = !values['no-manifest'];
  } else if (values.yes) {
    genManifest = true;
  } else {
    const ans = await p.confirm({
      message: 'Generate MANIFEST.MF now? (No = skip details, copy your own file later)',
      initialValue: true,
    });
    if (p.isCancel(ans)) onCancel();
    genManifest = ans;
  }

  // --- Prompts (only for values missing from flags, unless --yes) -------
  const need = (key) => values[key] === undefined;
  let answers = {};
  if (!values.yes) {
    const questions = {};
    if (genManifest && need('midlet-name')) {
      questions.midletName = () =>
        p.text({
          message: 'MIDlet name?',
          placeholder: projectName,
          defaultValue: projectName,
          validate: required('MIDlet name'),
        });
    }
    if (genManifest && need('package')) {
      questions.pkg = () =>
        p.text({
          message: 'Java package?',
          placeholder: DEFAULT_PACKAGE,
          defaultValue: DEFAULT_PACKAGE,
          validate: validateJavaPackage,
        });
    }
    if (genManifest && need('class')) {
      questions.cls = () =>
        p.text({
          message: 'Main MIDlet class?',
          placeholder: `${toPascalCase(projectName)}MIDlet`,
          defaultValue: `${toPascalCase(projectName)}MIDlet`,
          validate: validateJavaClass,
        });
    }
    if (genManifest && need('icon')) {
      questions.icon = () =>
        p.text({
          message: 'MIDlet icon? (empty to skip)',
          placeholder: DEFAULT_ICON,
          defaultValue: DEFAULT_ICON,
        });
    }
    if (genManifest && need('vendor')) {
      questions.vendor = () =>
        p.text({
          message: 'MIDlet vendor?',
          placeholder: DEFAULT_VENDOR,
          validate: required('Vendor'),
        });
    }
    if (genManifest && need('midlet-version')) {
      questions.version = () =>
        p.text({
          message: 'MIDlet version?',
          placeholder: DEFAULT_VERSION,
          defaultValue: DEFAULT_VERSION,
          validate: required('Version'),
        });
    }
    if (need('jdk-path')) {
      questions.jdkPath = () =>
        p.text({
          message: 'JDK path?',
          placeholder: DEFAULT_JDK_PATH,
          defaultValue: DEFAULT_JDK_PATH,
          validate: required('JDK path'),
        });
    }
    if (need('zkm')) {
      questions.zkm = () =>
        p.confirm({
          message: 'Generate ZKM.txt from the bundled example?',
          initialValue: false,
        });
    }
    if (Object.keys(questions).length > 0) {
      answers = await p.group(questions, {
        onCancel: () => onCancel(),
      });
    }
  }
  const pick = (flag, key, def) =>
    values[flag] !== undefined ? values[flag] : (answers[key] !== undefined ? answers[key] : def);

  const midletName = String(pick('midlet-name', 'midletName', projectName)).trim();
  const midlet1Name = String(values['midlet-1-name'] ?? midletName).trim() || midletName;
  const pkg = String(pick('package', 'pkg', DEFAULT_PACKAGE)).trim();
  const cls = String(pick('class', 'cls', `${toPascalCase(projectName)}MIDlet`)).trim();
  const icon = normPath(pick('icon', 'icon', DEFAULT_ICON));
  const vendor = String(pick('vendor', 'vendor', values.yes ? DEFAULT_VENDOR : '')).trim();
  const version = String(pick('midlet-version', 'version', DEFAULT_VERSION)).trim();
  // NOTE: no normPath on the shared default — it is an Ant expression
  // (${user.home}), not a local path. Only --common-dir values are normalized.
  const usingShared = values['common-dir'] === undefined;
  const commonDir = usingShared ? SHARED_COMMON_DIR : normPath(values['common-dir']);
  const jdkPath = normPath(pick('jdk-path', 'jdkPath', DEFAULT_JDK_PATH));
  const javaSource = String(pick('java-source', 'javaSource', DEFAULT_JAVA)).trim() || DEFAULT_JAVA;
  const javaTarget = String(pick('java-target', 'javaTarget', DEFAULT_JAVA)).trim() || DEFAULT_JAVA;
  const wantZkm = values.zkm ?? answers.zkm ?? false;

  if (genManifest) {
    if (!midletName) fail('MIDlet name is required. Pass --midlet-name or run interactively.');
    if (!vendor) fail('Vendor is required. Pass --vendor or run interactively.');
    if (!version) fail('Version is required. Pass --midlet-version or run interactively.');
    const pkgError = validateJavaPackage(pkg);
    if (pkgError) fail(`Invalid --package: ${pkgError}`);
    const clsError = validateJavaClass(cls);
    if (clsError) fail(`Invalid --class: ${clsError}`);
  }
  if (!commonDir) fail('common.dir is empty. Omit --common-dir to use the ~/.j2me-build-common shared copy.');
  if (!jdkPath) fail('JDK path is required. Pass --jdk-path or run interactively.');

  const projectOutput = sanitizeOutput(projectName);
  const packagePath = pkg.replace(/\./g, '/');
  const fullClass = `${pkg}.${cls}`;

  // --- Environment warnings (non-fatal) ----------------------------------
  const warnings = [];
  if (genManifest && !/^\d+\.\d+\.\d+/.test(version)) {
    warnings.push(`Version "${version}" is not X.Y.Z.`);
  }
  if (usingShared) {
    const sharedRoot = path.join(os.homedir(), SHARED_DIR_NAME);
    if (!(await pathExists(path.join(sharedRoot, 'common.xml')))) {
      warnings.push(`Shared copy not installed at ${SHARED_COMMON_DIR} — run 'create-j2me-game install' first.`);
    } else {
      const stamp = await fs.readFile(path.join(sharedRoot, '.version'), 'utf8').then((t) => t.trim()).catch(() => '');
      if (stamp && stamp !== PKG_VERSION) {
        warnings.push(`Shared copy is v${stamp}, this tool is v${PKG_VERSION} — re-run 'create-j2me-game install' to refresh it.`);
      }
    }
  } else {
    const commonAbs = path.isAbsolute(commonDir) ? commonDir : path.resolve(targetDir, commonDir);
    if (!(await pathExists(commonAbs))) {
      warnings.push(`common.dir not found: ${commonDir} — fix build.properties before running ant.`);
    } else if (!(await pathExists(path.join(commonAbs, 'common.xml')))) {
      warnings.push(`common.xml not found under ${commonDir} — is that really j2me-build-common?`);
    }
  }
  const javacExe = path.join(jdkPath, 'bin', 'javac.exe');
  const javacBin = path.join(jdkPath, 'bin', 'javac');
  const javacFound = (await pathExists(javacExe))
    ? javacExe
    : ((await pathExists(javacBin)) ? javacBin : null);
  if (!javacFound) {
    warnings.push(`javac not found under ${jdkPath}/bin — fix jdk.path before running ant.`);
  } else {
    const javacVer = await javacVersion(javacFound);
    if (javacVer && !/1\.7/.test(javacVer)) {
      warnings.push(`javac reports "${javacVer}" — this build needs JDK 7 (source/target 1.4).`);
    }
  }
  if (genManifest && icon && !icon.startsWith('/')) {
    warnings.push(`Icon "${icon}" does not start with '/'. MIDlet icons are usually absolute (e.g. /icon.png).`);
  }
  if (!genManifest && ['midlet-name', 'midlet-1-name', 'vendor', 'midlet-version', 'package', 'class', 'icon'].some((k) => values[k] !== undefined)) {
    warnings.push('Manifest options are ignored with --no-manifest.');
  }

  // --- Write files (never overwrite) --------------------------------------
  const replacements = {
    __PROJECT_NAME__: projectName,
    __PROJECT_OUTPUT__: projectOutput,
    __COMMON_DIR__: commonDir,
    __JDK_PATH__: jdkPath,
    __JAVA_SOURCE__: javaSource,
    __JAVA_TARGET__: javaTarget,
    __MIDLET_NAME__: midletName,
    __MIDLET_1_NAME__: midlet1Name,
    __MIDLET_VERSION__: version,
    __MIDLET_VENDOR__: vendor,
    __MIDLET_ICON__: icon,
    __MIDLET_CLASS__: fullClass,
    __PACKAGE__: pkg,
    __CLASS__: cls,
  };
  const render = (text) => {
    let out = text;
    for (const [token, value] of Object.entries(replacements)) {
      out = out.split(token).join(value);
    }
    return out;
  };

  const created = [];
  const skipped = [];
  async function writeIfMissing(rel, content) {
    const abs = path.join(targetDir, rel);
    if (await pathExists(abs)) {
      skipped.push(rel);
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
    created.push(rel);
  }

  const spinner = p.spinner();
  spinner.start('Scaffolding project...');
  try {
    const readTemplate = (name) => fs.readFile(path.join(TEMPLATE_DIR, name), 'utf8');
    await writeIfMissing('build.xml', render(await readTemplate('build.xml')));
    await writeIfMissing('build.properties', render(await readTemplate('build.properties')));
    await writeIfMissing('.gitignore', await readTemplate('gitignore'));
    await fs.mkdir(path.join(targetDir, 'ext-libs'), { recursive: true });
    if (genManifest) {
      await writeIfMissing('MANIFEST.MF', render(await readTemplate('MANIFEST.MF')));
      await writeIfMissing(
        path.join('src', packagePath, `${cls}.java`),
        render(await readTemplate(path.join('src-stub', 'MainMIDlet.java'))),
      );
    }
    if (genManifest && icon) {
      const iconRel = path.join('res', icon.replace(/^\/+/, ''));
      const abs = path.join(targetDir, iconRel);
      if (await pathExists(abs)) {
        skipped.push(iconRel);
      } else {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, Buffer.from(PLACEHOLDER_ICON_BASE64, 'base64'));
        created.push(iconRel);
      }
    }
    if (wantZkm) {
      await writeIfMissing('ZKM.txt', await readTemplate('ZKM.txt'));
    }
  } catch (err) {
    spinner.stop('Scaffold failed.');
    fail(`Could not write files: ${err.message}`);
  }
  spinner.stop('Project ready.');

  // --- Summary --------------------------------------------------------------
  const lines = [
    `Output JAR: ${c.cyan(`target/dist/${projectOutput}.jar`)}`,
    `Shared common: ${c.cyan(commonDir)}${usingShared ? ' (~/.j2me-build-common, one install per machine)' : ' (external)'}`,
    `${c.green(`Created ${created.length} file(s):`)}`,
    ...created.map((f) => `  ${c.dim('+')} ${f}`),
  ];
  if (!genManifest) {
    lines.push(`${c.yellow('!')} MANIFEST.MF, stub source and icon skipped — copy your own before running ant build.`);
  }
  if (skipped.length > 0) {
    lines.push(`${c.yellow(`Skipped (${skipped.length}, already exist):`)}`);
    lines.push(...skipped.map((f) => `  ${c.dim('=')} ${f}`));
  }
  for (const warning of warnings) {
    lines.push(`${c.yellow('!')} ${warning}`);
  }
  p.note(lines.join('\n'), 'Summary');
  p.outro(`Next steps:\n  ${c.cyan(`cd ${dirInput}`)}\n  ${c.cyan('ant clean build')}`);
}

main().catch((err) => {
  console.error(c.red(`Unexpected error: ${err?.message ?? err}`));
  process.exit(1);
});
