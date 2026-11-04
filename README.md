# create-j2me-game

Scaffold a ready-to-build J2ME game project (Ant + ProGuard + MicroEmulator) —
the way `npm create vite@latest` scaffolds a web project.

## Quick start

Requirements: Node 18+, JDK 7, Apache Ant.

```bash
npm i -g 0xFenix/create-j2me-game   # once per machine
create-j2me-game install            # once per machine: shared build files -> ~/.j2me-build-common
create-j2me-game my-game            # interactive setup
cd my-game
ant clean build
```

Or without installing:

```bash
npx -y github:0xFenix/create-j2me-game my-game
```

Locked-down npm (only `file`/`directory` installs allowed): download the
`.tgz` from the [Releases page](https://github.com/0xFenix/create-j2me-game/releases)
and install the file, or clone and install the directory:

```bash
npm i -g ./create-j2me-game-X.Y.Z.tgz
# or:
git clone https://github.com/0xFenix/create-j2me-game
npm i -g ./create-j2me-game
```

The generated project builds immediately: a stub `MIDlet`, a placeholder
`res/icon.png`, and a `MANIFEST.MF` filled in from your answers. Replace the
stub and the icon with your game.

## How it works

The build files (`common.xml`, `libs/`, ProGuard, MicroEmulator) ship inside
this tool. `install` places one copy at `~/.j2me-build-common` per machine,
and every project records `common.dir=${user.home}/.j2me-build-common` — the
same string resolves on every machine, so a project moved elsewhere (git,
zip) builds there as long as the tool is installed. No path to configure, no
symlink, no env var.

Microemulator-only mode: set `java.api=se` in `build.properties` (or pass
`-Djava.api=se` to Ant) to put the JDK `rt.jar` first on the compile
bootclasspath so J2SE APIs compile. The output will NOT run on real devices —
default `j2me` stays strict CLDC stubs, safe for devices. `se` requires a JDK
with `jre/lib/rt.jar` (6/7/8). Compiling with `java.api=se` prints a yellow
build-time warning that the output is MicroEmulator-only.

## Commands

```bash
create-j2me-game install       # install or refresh the shared build files
create-j2me-game [directory]   # scaffold (interactive: MIDlet name, package,
                               # class, vendor, version, JDK path, ZKM opt-in)
create-j2me-game --help        # all flags
```

Non-interactive (CI-friendly):

```bash
create-j2me-game my-game --yes
create-j2me-game my-game --yes --package com.foo.game --vendor "Foo Studio" --zkm
```

Patching an existing client (bring your own `MANIFEST.MF`): `--no-manifest`
skips the MIDlet details and generates only `build.xml`, `build.properties`,
and `.gitignore` (+ `ZKM.txt` with `--zkm`). Then copy your own
`MANIFEST.MF`, `src/`, and `res/` in before running `ant`:

```bash
create-j2me-game my-game --yes --no-manifest
```

Existing files are never overwritten; they are reported as skipped.
`--common-dir <path>` points at a different copy instead of the shared one.
Zelix KlassMaster is never bundled (licensed tool) — point
`zkm.home`/`zkm.jar` at your own copy if you use it.

## Updates

New versions ship as GitHub releases. The CLI checks the latest release once
a day (cached, silent when offline; skipped in CI or with
`CREATE_J2ME_GAME_NO_UPDATE_CHECK=1`) and prints a notice when yours is old:

```bash
npm i -g 0xFenix/create-j2me-game   # update (or re-run your original install command)
create-j2me-game install            # then refresh ~/.j2me-build-common
```

Scaffolding also warns when the shared copy's version stamp differs from the
tool — `install` is a clean replace, so re-running it doubles as the upgrade.

## Per-OS notes

- The CLI itself is portable: `node index.js`, `npx`, and `npm link` work on
  Windows, macOS, and Linux. In CI or non-TTY shells use `--yes` plus flags.
- `jdk.path` defaults to `JAVA_HOME` when set; otherwise
  `C:/Program Files (x86)/Java/jdk1.7.0_80` (Windows),
  `/Library/Java/JavaVirtualMachines/jdk1.7.0_80.jdk/Contents/Home` (macOS),
  `/usr/lib/jvm/jdk1.7.0_80` (Linux). A JDK 7 with `javac` is required —
  the CLI warns when it cannot find one.
- Generated projects build with the same `ant clean build` everywhere
  (`common.xml` picks `javac`/`java` with or without `.exe` per OS).
- Directory names reject `:` (outside a Windows drive letter): legal on
  Unix but breaks Windows checkouts, so it is disallowed for portability.

## Develop

```bash
npm install
node index.js <target-dir> --yes   # scaffold preview, no prompts
npm run smoke                      # full assertion suite
```

`template/` is the source of truth (`__TOKENS__` are filled in by `index.js`
at scaffold time); `common/` is the committed install payload. Verify changes
with `git diff` and `npm run smoke`.

## Release (maintainers)

```bash
# bump "version" in package.json, commit, then:
npm pack
gh release create vX.Y.Z --notes "..." create-j2me-game-X.Y.Z.tgz
```
