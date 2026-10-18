---
description: "Standalone Harness profile layer providing the Fast Resume canvas editor, document management and Session tools."
kind: "package-bundle"
---

# dsh-fast-resume

English | [中文](README.zh.md)

## Summary

This optional profile layer embeds the complete Fast Resume canvas editor in Harness and adds profile-local resume management and agent tools. It includes six templates, recursive layers, properties, pages, imports, history and PDF/PNG/JSON export. Agent assistance uses normal Harness Sessions and their configured models. Fast Resume login, account administration and separate model credentials are excluded.

The management workspace includes real first-page previews, title search and ordering, actual document/page counts, and visible editing actions. Aurora highlights and restrained motion follow the Harness light/dark theme, keyboard focus and reduced-motion preferences; visible-card previews are cancelled and released when obsolete. Delete confirmation shows the exact resume and revision, explains removal of saved history, and provides keyboard-accessible Cancel/Confirm actions with pending and failure feedback. The editor keeps one compact Resume space/title/status strip; save, history and panel controls sit in the lower icon toolbar. Version history includes actual saved-page thumbnails, page selection and named-version saving; restoring creates a new current revision and requires a clean draft. Left and right editor sidebars resize proportionally, snap closed past their minimum threshold, and reopen from the divider or toolbar with the previous expanded width.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration and storage](#configuration-and-storage)
- [Understand the implementation](#understand-the-implementation)
- [Build and publish](#build-and-publish)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Requires Harness **0.2.1-rc.2**, pnpm on PATH, and Node `^22.19.0 || >=24.0.0`. Install the built tarball into the profile you use:

```sh
dsh plugin --profile web add /absolute/path/dsh-fast-resume-0.1.0.tgz
dsh --profile web
```

After installation, open **Resumes** in the Harness sidebar. Create or import a resume, select a template, and edit with the original canvas, layer and property panels. Saves use revision checks. When another client or an agent changes the same document, a dirty draft is retained with reload and save-as-copy choices. Recovery drafts require an explicit choice.

Use the editor's assistant controls to open an ordinary Harness conversation with the document ID, revision and selected layers. Configure a model in Harness as usual. Review durable proposals in the editor, apply them, or undo an applied proposal. Undo preserves unrelated later edits and rejects overlapping changes.

```sh
dsh plugin --profile web remove dsh-fast-resume
```

Removing the package retains profile-local resume files and exports. Reinstall into the same profile to use them again. For an initialized Desktop profile, replace `web` with `desktop` and restart the application. The registry command becomes available only after the owner publishes the package:

```sh
dsh plugin --profile web add dsh-fast-resume@0.1.0
```

-----

<a id="configuration-and-storage"></a>
## Configuration and storage

The installed [patch](cordis.patch.yml) contributes `fast-resume` and `fast-resume-tools`. Override the Host row in your profile's `cordis.patch.yml`:

```yaml
- id: fast-resume
  config:
    autosaveDelayMs: 2000
    renderPixelRatio: 2
```

| Field | Default | Meaning |
|---|---|---|
| `storageDir` | `<profile>/data/fast-resume` | Atomic document envelopes, history, proposals, receipts and exports |
| `autosaveDelayMs` | `2000` | Browser save debounce |
| `maxDocumentBytes` / `maxImportBytes` | `10485760` each | Document/render response and imported file byte bounds |
| `maxVersions` | `100` | Retained document versions |
| `renderTimeoutMs` / `rendererLeaseMs` | `30000` / `15000` | Render deadline and renewable connected-client lease |
| `maxRenderRequests` / `maxRenderPixels` | `8` / `32000000` | Pending render requests and decoded PNG pixels |
| `renderPixelRatio` | `2` | PNG raster multiplier; allowed range `0.1`–`4` |
| `lockWaitMs` / `maxProposalOperations` | `10000` / `256` | Cross-process lock wait and operations per proposal |
| `frameConnectTimeoutMs` / `rendererPollIntervalMs` | `15000` / `1000` | Editor connection deadline and renderer polling; polling must be shorter than the lease |
| `refreshIntervalMs` / `bridgeTimeoutMs` | `2000` / render plus connection deadlines | Document refresh and message deadline; messages must allow the full export deadline |

JSON export contains an editable Fast Resume backup. PDF exports all pages; PNG exports the selected page. PDF and PNG require a connected Harness client, whose background renderer stays available when the resume panel is closed. The Host verifies complete binary data, dimensions and page count before storing an artifact and returning its receipt. Receipt dimensions use millimeters for PDF/JSON and pixels for PNG.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The Host owns optimistic revisions, atomic file replacement, cross-process locks, durable proposals and idempotent mutation receipts. Its generated authenticated Remote API serves a thin Harness Client plugin. The complete editor runs in a packaged opaque-origin iframe using a nonce-bound MessagePort with validated requests. It has no model credentials or dependency on the original server. Parent-owned recovery storage retains browser drafts.

The renderer receives an immutable committed document and agreed pixel ratio. Request cancellation, timeout, renderer disconnect and plugin disposal invalidate pending exports. Retained upstream source and its baseline hashes are in the source distribution; [upstream-content.json](upstream-content.json), [LICENSE](LICENSE), [NOTICE](NOTICE) and [commercial licensing terms](COMMERCIAL_LICENSE.md) accompany publication.

</details>

-----

<a id="build-and-publish"></a>
## Build and publish

The source project builds independently of either original checkout. From its root, with a supported Node version:

```sh
npm ci --workspaces=false
npm run build --workspaces=false
node node_modules/vitest/vitest.mjs run tests upstream --maxWorkers=1
node scripts/check-consumer.mjs
node scripts/check-release.mjs
npm pack --workspaces=false --ignore-scripts
```

The package publishes ESM Host, tools, Client, public types and generated Typert exports, plus the editor HTML and installation patch. There is no custom application binary. Test the tarball through `dsh plugin` before publishing it with your npm account. The npm package name is `dsh-fast-resume`; the source repository is [lianzxah/dsh-fast-resume](https://github.com/lianzxah/dsh-fast-resume). See the [verification report](docs/verification.md) for executed checks and their limits.

The source project also exposes `test:integration`, `test:e2e`, `test:snapshot` and `check:release`. Installed checks require `DSH_TEST_CLI`, `DSH_TEST_REPLAY` and a tarball argument; `DSH_TEST_REGISTRY` optionally chooses the package registry. `test:snapshot` derives its two model calls from an actual recorded live Session and invokes the installed `resume_read` without model credentials. The scripted six-tool integration check separately covers uninstall/reinstall and disable/re-enable retention.

-----

<a id="model-experience"></a>
## Model Experience

The tools list, create and read documents, propose and apply operations, undo changes, inspect or restore history, and export artifacts. They run in the normal Agent scope and their requests/results remain in the Session log. Read results replace inline image bytes with stable asset references; export tool results contain artifact paths and measured metadata, without base64 payloads. The editor's prompt references the document; the agent reads its contents through the logged tools.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Fast Resume uses the retained **PolyForm Noncommercial 1.0.0** license; commercial use requires the upstream owner's separate written license. This plugin does not change those terms. Original editor labels remain Chinese; the Harness shell supports English and Chinese. Word/PDF imports extract semantic content rather than reproduce arbitrary source layouts. Headless PDF/PNG export requires a connected browser renderer. Untrusted remote images may fail browser loading or canvas export and produce an explicit error. Live-model optimization requires the user's normal Harness model configuration.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer context</summary>

No Harness loop or released Session format changes are required. The project builds from its own package lockfile.

</details>
