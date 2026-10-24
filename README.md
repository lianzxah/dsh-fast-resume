---
description: "Create, manage and improve resumes inside DeepSeek Harness, with a full canvas editor and agent assistance."
kind: "package-bundle"
---

# Fast Resume for DeepSeek Harness

English | [中文](README.zh.md)

## Summary

Create, manage and refine your resumes inside DeepSeek Harness. Edit text, images, shapes and nested layers on a multipage canvas, choose from six templates, and export PDF, PNG or editable JSON. Use your existing Harness model to propose wording and layout improvements, review the changes, and apply them to the same document. Install `dsh-fast-resume` as an optional profile layer; no separate Fast Resume account is required.

![Resume workspace with real previews, search and document management](docs/images/resume-workspace.jpg)

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#use-this-package)
- [Usage examples](#usage)
- [Configuration and storage](#configuration-and-storage)
- [Development](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Limitations and license](#known-limitations-and-deferred-work)

-----

<a id="features"></a>
## Features

Keep visual editing and agent assistance in one workflow.

| Capability | What you can do |
|---|---|
| Canvas editing | Edit text, images and shapes; group nested layers; control order, visibility, locks, alignment and element properties. |
| Templates and pages | Start with six templates, manage multiple pages, zoom the canvas, and resize or collapse either sidebar. |
| Resume management | Browse real first-page thumbnails; search, sort, rename, duplicate and delete resumes. |
| Version history | Save named versions, preview historical pages and restore a version as a new revision. |
| Harness assistance | Send the current resume and selected-layer context to a normal Harness conversation; review, apply or revert durable proposals. |
| Import and export | Import JSON, Markdown, Word or PDF; export all pages to PDF, the selected page to PNG, or an editable JSON backup. |

-----

<a id="screenshots"></a>
## Screenshots

These screenshots show the installed Harness Web plugin with synthetic resumes used for verification.

### Canvas editor

Collapse the sidebars for more canvas space, or reopen them from the right-hand toolbar to work with templates, layers and properties. Dragging past the minimum threshold also collapses a sidebar.

![Canvas editor with collapsed sidebars and a two-page resume](docs/images/resume-editor.jpg)

### Visual version history

Identify versions by their actual saved-page thumbnails. Select a version, switch preview pages and restore it without replacing the existing history.

![Version history with thumbnails, named saves and page preview](docs/images/version-history.jpg)

-----

<a id="use-this-package"></a>
## Installation

Use **DeepSeek Harness 0.2.1-rc.2**, Node **`^22.19.0 || >=24.0.0`**, and pnpm available on PATH. The plugin version in this repository is `0.1.0`.

Obtain a built `.tgz` package, or generate one with the [source-build steps](#understand-the-implementation). Install it into the profile you use:

```sh
dsh plugin --profile web add /absolute/path/dsh-fast-resume-0.1.0.tgz
dsh --profile web
```

Open **Resumes / 简历** in the Harness sidebar. The workspace displays your saved resumes and the create/import actions.

If `dsh-fast-resume@0.1.0` has been published to your registry, you can install by package name instead:

```sh
dsh plugin --profile web add dsh-fast-resume@0.1.0
```

For an initialized Desktop profile, replace `web` with `desktop` and restart the application. The recorded browser verification covers Web; Desktop interaction is not claimed as verified.

-----

<a id="usage"></a>
## Usage examples

### 1. Create and edit a resume

1. Choose **New resume / 新建简历**, enter a name, and choose a template or blank document.
2. Use the left panel to switch templates, inspect layers and manage pages. Select an element and edit its text, dimensions, colors or links in the properties panel.
3. Drag either divider to resize the workspace. Use the toolbar panel icons to collapse or reopen the sidebars; the mounted workspace remembers their expanded widths.
4. Wait for the saved indicator, or use the save icon / `Ctrl+S`.

### 2. Refine it with your Harness agent

Configure a model in Harness, save the current draft, then open **AI assistant / AI助手** in the editor. Submit an instruction; the plugin carries the document ID, revision and selected layers into a normal Harness Session.

Example: improve wording while preserving facts.

> Read this resume and improve the work-experience wording for a frontend engineering role.
> Preserve the facts, dates and figures. Do not invent achievements or skills.
> Create a proposal first; do not apply it until I have reviewed it.

Review the before/after preview in the assistant panel, then apply the proposal you want. You can revert an applied proposal; overlapping later edits produce a conflict instead of being overwritten.

### 3. Save a milestone and compare versions

Open the history icon, enter a version name such as “Frontend application”, and save a named version. Select a thumbnail to inspect that snapshot; use the page selector for multipage resumes. Restore only after the current draft is saved. Restoring creates a new revision and retains existing versions.

### 4. Import or export your document

Use **Import / 导入** for an existing JSON backup, Markdown, Word or PDF. Choose PDF for a document containing all pages, PNG for the selected page, or JSON to keep an editable backup. PDF/Word imports extract semantic content; they do not promise the original layout. PDF/PNG export requires a connected Harness client renderer.

-----

<a id="configuration-and-storage"></a>
## Configuration and storage

Resume files, history, proposals and exports stay in the active profile, under `<profile>/data/fast-resume` by default. Autosave uses revision checks; when another client or agent changes the same resume, a dirty draft is retained with reload and save-as-copy choices. Draft recovery requires an explicit choice.

<details>
<summary>Advanced configuration</summary>

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

</details>

To remove the plugin:

```sh
dsh plugin --profile web remove dsh-fast-resume
```

Uninstalling retains the profile-local resume files and exports. Reinstall into the same profile to use them again.

-----

<a id="understand-the-implementation"></a>
## Development

The source project builds independently of the original Fast Resume and Harness checkouts. From the plugin project root:

```sh
npm ci --workspaces=false
npm run build --workspaces=false
npm pack --workspaces=false --ignore-scripts
```

The result is `dsh-fast-resume-0.1.0.tgz`. Test that tarball through `dsh plugin` before publishing. The package includes the Host, tools, Client, editor HTML, installation patch and documentation.

<details>
<summary>Implementation overview</summary>

The [installation patch](cordis.patch.yml) adds `fast-resume` and `fast-resume-tools`. The Host owns revisions, atomic file writes, durable proposals and mutation receipts. The editor runs in an opaque-origin iframe and communicates through a validated MessagePort; it does not hold model credentials or call the original Fast Resume server. Retained upstream source and its hashes are recorded in [upstream-content.json](upstream-content.json).

</details>

-----

<a id="model-experience"></a>
## Model Experience

Resume tools run in the normal Agent scope, and their requests/results remain in the Harness Session log. The agent can read the current document, propose changes, apply or revert proposals, inspect history and export artifacts. Image reads use asset references; export results include artifact paths and metadata instead of inline base64 data.

-----

<a id="known-limitations-and-deferred-work"></a>
## Limitations and license

- The editor labels are currently Chinese; the Harness integration supports English and Chinese.
- Model-assisted editing uses your Harness model configuration. Review proposals before applying changes to your resume.
- Remote images can fail to load or prevent canvas export; the plugin reports these failures.
- Fast Resume retains **PolyForm Noncommercial 1.0.0**. Commercial use requires separate written permission from the upstream owner. See [LICENSE](LICENSE), [NOTICE](NOTICE) and [commercial licensing terms](COMMERCIAL_LICENSE.md).

For executed checks and platform coverage, read the [verification report](docs/verification.md) ([中文](docs/verification.zh.md)). Source and issue tracking: [lianzxah/dsh-fast-resume](https://github.com/lianzxah/dsh-fast-resume).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer context</summary>

Keep screenshots based on synthetic resumes, and update both language versions when workflows change.

</details>
