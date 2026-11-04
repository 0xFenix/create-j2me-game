# create-j2me-game

Scaffold a J2ME game project with shared Ant build files — the way
`npm create vite@latest` scaffolds a web project.

```bash
npm create j2me-game@latest my-game
cd my-game
ant clean build
```

The generated project builds immediately: it ships a stub `MIDlet`, a
placeholder `res/icon.png`, and a `MANIFEST.MF` filled in from
your answers. Replace the stub and the icon with your game.

## Install

One install per machine (requires Node 18+):

```bash
npm i -g create-j2me-game
create-j2me-game install   # once per machine: shared build files -> ~/.j2me-build-common
create-j2me-game my-game
```

Or without installing:

```bash
npm create j2me-game@latest my-game
```

Local dev version (before publish): `npm link` from the repo root, or run
`node index.js my-game` directly.

## Usage

Interactive TUI (asks MIDlet name, package, class, vendor, version,
JDK path, and whether to include `ZKM.txt`):

```bash
npm create j2me-game@latest [directory]
```

Shared, not copied: the build files (`common.xml`, `libs/`, ProGuard,
microemulator) ship inside this package, and `create-j2me-game install`
places one copy at `~/.j2me-build-common` per machine. New projects record
`common.dir=${user.home}/.j2me-build-common` — the same string resolves on
every machine, so a project moved elsewhere (git, zip) builds there as long
as the tool is installed. No path to configure, no symlink, no env var.
`--common-dir <path>` points at a different copy instead. Zelix
KlassMaster is never bundled (licensed tool) — point `zkm.home`/`zkm.jar`
at your own copy if you use it.

Non-interactive (CI-friendly):

```bash
npm create j2me-game@latest my-game -- --yes
npm create j2me-game@latest my-game -- --package com.foo.game --vendor "Foo Studio" --zkm
```

Bring your own `MANIFEST.MF` (patching an existing client): `--no-manifest`
skips the MIDlet/package/class/vendor/version/icon prompts and does not
generate `MANIFEST.MF`, the stub source, or the icon. Only `build.xml`,
`build.properties`, and `.gitignore` (+ `ZKM.txt` with `--zkm`) are created —
then copy your own `MANIFEST.MF`, `src/`, and `res/` into the project before
running `ant`:

```bash
npm create j2me-game@latest my-game -- --yes --no-manifest
```

Run `create-j2me-game --help` for all flags. Existing files are never
overwritten; they are reported as skipped.

## Develop

Requires Node 18+.

```bash
npm install
node index.js <target-dir> --yes   # smoke test, no prompts
npm run smoke                      # full assertion suite (see below)
```

`template/` is the source of truth — edit it directly (`__TOKENS__` are
filled in by `index.js` at scaffold time). Only `template/src-stub/` and
`template/gitignore` (copied as `.gitignore`) are hand-maintained files;
the rest are plain project files with tokens.
Verify template changes with `git diff` and `npm run smoke`.

`npm run smoke` scaffolds into a temp dir with `--yes` and asserts the
result (files present, no leftover `__TOKENS__`, descriptor trailing blank
line, valid `icon.png`). Pure Node, no prompts or shell — runs identically
on Windows, macOS, and Linux.

## Per-OS notes

- The CLI itself is portable: `node index.js`, `npx`, and `npm link` work
  on all three. In CI or non-TTY shells use `--yes` plus flags.
- `jdk.path` defaults to `JAVA_HOME` when set; otherwise
  `C:/Program Files (x86)/Java/jdk1.7.0_80` (Windows),
  `/Library/Java/JavaVirtualMachines/jdk1.7.0_80.jdk/Contents/Home` (macOS),
  `/usr/lib/jvm/jdk1.7.0_80` (Linux). A JDK 7 with `javac` is required —
  the CLI warns when it cannot find one.
- `common.xml` picks `javac`/`java` with or without `.exe` per OS, so
  generated projects build with the same `ant clean build` everywhere.
- Directory names reject `:` (outside a Windows drive letter): legal on
  Unix but breaks Windows checkouts, so it is disallowed for portability.

## Publish

```bash
npm pack --dry-run   # verify the packed files (index.js, template/, common/, README.md, LICENSE)
npm login
npm publish
```
