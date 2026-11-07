---
description: "AI assistant acceptance evidence, replay adaptations and remaining release limits."
kind: "reference"
---

# AI assistant acceptance

English | [中文](assistant-acceptance.zh.md)

## Summary

Acceptance uses synthetic documents in the isolated integration checkout, Node 24.15.0 and Harness artifacts reporting 0.2.1-rc.2. The tested Web instance is `http://127.0.0.1:59190/`; the original profile on port 58358 is unchanged. Package dependencies were independently installed from the registry. The browser used the configured DeepSeek-V4.1-Flash model (`deepseek-account` / `deepseek-flash`, high reasoning effort). No new model credentials were required.

Local integration acceptance passed for the executed scope, including fresh real-model runs through both entries after the recovery and Host disposal fixes. The declared Harness dependency version does not establish that the published runtime supports every tested interaction: Web and CLI acceptance used locally built Harness artifacts. Publication requires a supporting tested Harness distribution and explicit approval.

## Table of Contents

- [Business outcomes](#business-outcomes)
- [Automated acceptance](#automated-acceptance)
- [Replay limits](#replay-limits)
- [Unexecuted checks](#unexecuted-checks)

<a id="business-outcomes"></a>
## Business outcomes

| Case | Observed result |
| --- | --- |
| Plugin AI entry | The final candidate created exactly one ordinary Standard-Preset Session, with four initialization events and no unsolicited prompt. Synthetic resume E advanced 2 → 3 through five successful tools with zero errors and exactly the requested text/font-size/color changes. The right editor acknowledged revision 3. JSON matched the saved document; PDF was 170,697 bytes with two A4 pages; PNG was 239,355 bytes at 1588 × 2246 with 62 CRC-verified chunks. Manual image width 87 saved 4; selective UI undo saved 5 and restored the seed except that width and the save timestamp. |
| Ordinary Session entry | The final candidate reused the existing Session and target A, executing five successful tools with zero errors and advancing 41 → 42 with exactly the requested text/font-size changes. The right editor acknowledged revision 42. JSON matched the saved document; PDF was 169,794 bytes with two A4 pages; PNG was 236,378 bytes at 1588 × 2246 with 61 CRC-verified chunks. Manual image width 86 saved 43; selective UI undo saved 44 and restored the seed except that width and the save timestamp. The earlier run also verified over 70 seconds of hidden-editor ownership. |
| Proposal and model undo | In the earlier recorded real-model case, proposal-only work left C at 5. Explicit review/apply saved 6; manual image width 85 saved 7. The real model selectively undid that proposal at 8 while retaining width 85. |
| R1 — Resume space | Blank/template creation, rename, title navigation, duplication with recursively distinct IDs, and delete cancellation retained the expected documents. |
| R2 — Full editing | Text, shape, visibility/lock, ordering, alignment, page operations and manual undo/redo ran on the canvas. A group moved X100 → 101 at revision 3; undo/save at 4 restored the complete prior document, including nested children. Both conversation editors retained manual image editing. |
| R3 — Layout/input | Both sidebars collapsed/restored; fit changed 74% → 138%; manual zoom reached 148% with horizontal scrolling. Reviews and chooser fit 390px; dialogs were inspected at 1440/1280/1024px with focus and close controls reachable. The 390px right editor fit within 389px. |
| R4 — Saves/history | Recovery on D5 acknowledged the saved revision after the latest Host restart. Earlier recovery on C8 remained unacknowledged for 31,339ms across uncertain-owner heartbeats, then explicit acknowledgement succeeded with no document write. Earlier manual/autosave, thumbnails, named revision 10, restore-created 11, restore-named 12 and manual/selective undo retained monotonic revisions and unrelated edits. |
| R5 — Import/export | Pasted Markdown created an editable document. JSON/DOCX/PDF parsing has automated coverage. Both real entry flows produced exact-revision JSON/PDF/PNG, including images and all PDF pages. |
| R6 — Compatibility/lifetime | Two Sessions retained independent targets. Compare did not retarget; explicit selection and acknowledged manual saves did. Hidden leases, completed-handoff reopen/recovery, and unknown ownership were checked. Installed catalog, retention and disabled-plugin checks are listed below. |
| R7 — Conversations | A separate real ordinary chat completed `NON_RESUME_REGRESSION_OK` with zero tools and no visible resume frame; its composer retained focus. Entry, history and background behavior preserved configured model selection and Session isolation. |

<a id="automated-acceptance"></a>
## Automated acceptance

Run the exact commands and entry-path setup in the [README](../README.md#understand-the-implementation). Checks use `npm --workspaces=false` in the plugin project. The final candidate retains the accepted fix artifacts; its unit/compiler/consumer evidence is inherited from the fix owner, while release packing, installed scripted/replay checks and document validation were run for this acceptance.

| Command | Result |
| --- | --- |
| `npm test --workspaces=false` | PASS: 55 files / 379 tests, including eleven actual Host-disposal barrier cases. The focused assistant/editor lifecycle run passed 119 tests across ten files. |
| `npm run build:artifacts --workspaces=false`, then `npm run build:check --workspaces=false` | PASS: latest Host metadata, Remote client and 2,099,102-character editor artifacts, followed by both compiler faces. All 50 runtime artifact hashes match the accepted fix manifest. |
| `node scripts/check-consumer.mjs` | PASS: actual temporary tarball installation with 126 registry dependency packages, strict NodeNext compilation without source aliases, and six published browser modules registered. |
| `npm run check:release --workspaces=false` | PASS: 76 packaged files, including the private lifetime helper declaration; eight retained export keys, Node range, license and source independence. The unchanged audit previously rejected disposable-copy negative controls for a changed Node range, removed tools export, missing review image and absolute runtime source path. |
| `npm run test:e2e --workspaces=false -- <candidate.tgz>` | PASS: eleven legacy/context/edit calls, uninstall/reinstall retention, disabled tools and all three seeded cases. The final documented tarball passes. |
| `npm run test:snapshot --workspaces=false -- <candidate.tgz>` | PASS: original image-redaction read and six plugin-entry, five ordinary-entry and four selective-undo recorded calls. The final documented tarball passes. |

The recovered-owner defect is resolved by the separately reviewed lifecycle fix. Deterministic tests retain rendered evidence through uncertain-owner heartbeats, keep unknown disconnect outcomes fenced, require fresh post-render evidence after reconciliation, and wait for the closing owner's durable detachment before expecting recovery. The earlier wait-budget experiment was reverted; no product timeout was widened. Eleven additional Host lifetime tests cover accepted assistant/editor requests through real provider and enclosing-context disposal, including final save/Session association and completion callbacks admitted during shutdown. This scope does not certify all legacy CRUD/export endpoints. Existing Router/source-map/React and malformed-PDF diagnostics remain visible in the supplied logs; passing checks do not imply warning-free output. The paired README/acceptance/plan records, local links, anchors and paragraph formatting were checked.

<a id="replay-limits"></a>
## Replay limits

The original image-byte-redaction fixture remains intact. Three additional curated actual turns recorded before the final lifecycle fix cover plugin entry 2 → 3, ordinary entry 35 → 36 and selective undo 7 → 8. These recordings were replayed unchanged against the final installed candidate; fresh browser/model verification is reported separately above. They use separate exact seeds, not an uninterrupted replay of manual browser history. The plugin case preserves its rejected malformed edit. The undo seed includes the actual proposal identity and later manual image edit.

Only tool/text streams, tool arguments/results and necessary lifecycle events are retained. Private reasoning, account/usage/delivery metadata and unrelated inputs are excluded; final prose is reduced to the recorded completion sentinel. Version-4 references are remapped, turn numbers restart at 1, and host paths become explicit fixture tokens. Saved content and expected errors remain asserted.

The public headless runner rejects Web preset-bearing Sessions. The approved test projection asserts the original `standard` preset, retains that original creation metadata in the fixture, and omits only `agentPreset` from the temporary headless initialization while mapping the working directory. Actual Session identity, binding and document seeds remain unchanged. This establishes installed tool behavior, not same-Preset or full Web Session continuation. Actual Standard-Preset behavior is covered separately by the browser runs above.

<a id="unexecuted-checks"></a>
## Unexecuted checks

Permanent GUI deletion, native image/file chooser selection for all four import formats, OS download destination selection, interactive nested-group creation, physical modified-wheel input, native CJK IME and OS reduced-motion switching were not run in the final browser pass. Store/parser/renderer, canvas, composition/wheel and reduced-motion tests complement these rows; they do not establish those unexecuted OS interactions. Desktop, all operating systems and exhaustive coverage were not run. No GUI PR or GIF submission, push or publication occurred.

The public sidebar API cannot reconstruct a switch away and back that occurs entirely between observable samples.

## Dev Note

The package retains the existing license, attribution, exports and version-1 resume envelope. This acceptance-only change introduces no persistence format or public API change. Preserve the distinction between actual browser evidence, scripted integration and curated installed-tool replay when evaluating a supporting Harness release.
