# AGENTS.md

Single-file ESM CLI (`type: module`, Node >=18). `index.js` is both entrypoint and `bin/create-j2me-game`; deps: `@clack/prompts`, `picocolors`.

## Layout

- `index.js` — all CLI logic (arg parse, prompts, validation, `render()` token fill, `writeIfMissing`, `install`, update check).
- `template/` — scaffold source of truth. `__TOKENS__` replaced via string split/join in `render()` (`index.js:517`). `build.xml` is 5-line wrapper importing `${common.dir}/common.xml`.
- `common/` — committed install payload shipped in `package.json:files`. Never bundle into scaffolded projects.
- `scripts/smoke-test.js` — assertion suite (`npm run smoke`).

## Commands

```bash
npm install
node index.js <target-dir> --yes   # scaffold preview, no prompts
npm run smoke                       # full verification, always run after template/index.js changes
```

Release: bump `package.json` version, commit, `npm pack`, `gh release create vX.Y.Z ...tgz`.

## Rules that bite

- Never overwrite: `writeIfMissing` (`index.js:527`) keeps existing files, reports them as `skipped`. Same for `res/<icon>` and `install` target contents except `install` itself is `rm + copy` (clean replace).
- `template/` + `index.js` replacements must stay in sync — smoke asserts no leftover `__TOKENS__`.
- `common.dir` default `${user.home}/.j2me-build-common` is an Ant expression, not a local path: do not normalize/resolve it. Only `--common-dir` values go through `normPath` (backslash→slash). `index.js:434`.
- `install` writes `.version` stamp (`<PKG_VERSION>\n`); scaffold warns on stamp mismatch — re-running `install` is the upgrade.
- Dir names reject `:` except Windows drive letter (`validateDirInput`, `index.js:145`) for cross-OS checkouts.
- `MANIFEST.MF` must keep trailing blank line (smoke checks last 2 bytes are `\n\n`).
- `res/icon.png` is a 1x1 transparent PNG from base64 (`PLACEHOLDER_ICON_BASE64`); smoke checks PNG magic.
- Update check: GitHub releases API, 3s timeout, cached 24h in `os.tmpdir()`, silent on failure, skipped when `CI` or `CREATE_J2ME_GAME_NO_UPDATE_CHECK=1` set. Smoke always sets the env var; `install` uses fake `HOME`/`USERPROFILE` so the real `~/.j2me-build-common` is untouched.
- `jdk.path`: prefer `JAVA_HOME` (slashes normalized), else per-OS JDK 7 fallback; warn-only if `javac` missing or not 1.7 — never fatal.
- `--no-manifest` skips `MANIFEST.MF` + stub + icon; manifest flags are then ignored (warn-only).
