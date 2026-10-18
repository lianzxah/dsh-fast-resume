# Fast Resume verification report

English | [中文](verification.zh.md)

## Scope

Checks ran on 2026-10-18 with Node 24.15.0 and the published Harness 0.2.1-rc.2, using synthetic resumes and isolated profiles. The supplied Harness snapshot has no Git metadata or installed workspace dependencies. Its full repository build, exhaustive coverage and Desktop platform matrix were not run. The original Fast Resume source was not modified.

## Independent build and automated checks

The complete-integration baseline source was copied to `/private/tmp/dsh-fast-resume-standalone.ZUNd5l`. Dependencies were installed from its own lockfile with `npm ci --workspaces=false --ignore-scripts`. An OS sandbox then denied reads of both original project directories. Negative controls confirmed both reads fail. All following checks passed in that independent directory under the denial policy.

| Command | Observed result |
|---|---|
| `node scripts/build.mjs` | Host, Client, 20 generated Remote methods and self-contained editor HTML built. |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.check.json` | Host and test aggregate passed after the artifact build. |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.browser.json` | Browser face passed after the artifact build. |
| `node node_modules/vitest/vitest.mjs run tests upstream/editor/__test__ upstream/shared/__test__ upstream/templates/__test__ upstream/canvas-engine/__test__ --maxWorkers=1` | 38 suites, 158 tests passed, including actual Markdown/DOCX/PDF imports, malformed inputs, nested groups/images/links/two pages, revisions, atomic failure, proposal retries/revert, separate concurrent recovery owners, asset-reference copies, lease recovery, real Gateway mounting, management search/order and preview cancellation. |
| `node scripts/check-consumer.mjs` | Strict NodeNext Host/Remote/types/Client artifact consumer passed without plugin sources or aliases, with `skipLibCheck: false`. |
| `node scripts/check-release.mjs` | Actual npm file list, ESM exports, assets, locale metadata, source independence and license checks passed: 55 files. |

The initial independent installation silently omitted the optional PDF native dependency after a registry download timeout; two PDF tests failed with missing DOMMatrix. Downloading that declared platform package from the public registry and repeating the unchanged lockfile installation fixed the environment. The final run above passes. Malformed-PDF rejection fixtures and React Router emit third-party diagnostic/advisory warnings; these are visible in the evidence log.

## Installed Harness Session evidence

`scripts/verify-harness.mjs` installs the tarball through `dsh plugin` into a temporary profile, runs six normal Session tools with the official scripted replay provider, parses exported JSON to assert the requested replacement at revision 2, uninstalls/reinstalls the plugin and confirms data remains, then disables the Host/tools and asserts no resume tool is advertised before re-enabling and reading the retained revision. This passed with both original source directories denied. Scripted replay verifies deterministic integration and is distinct from the real model run below.

Set `DSH_TEST_CLI` to the installed `@deepseek-ai/dsh/lib/bin.js`, `DSH_TEST_REPLAY` to the same-version replay provider's `lib/index.js`, and pass the tarball path. Add `--offline` only with a complete warm package cache. The script does not use model credentials. Shared Harness services remain peers; the runtime installation anchor supplies their canonical identities.

`scripts/verify-recorded-session.mjs` installs the tarball and replays the actual first turn of live Session `session-85af7729-f1e0-4b91-a7d3-c048e4286955`, using the official format reader and recorded assistant streams. Its two calls invoke the real `resume_read`, select the saved image, redact inline bytes and finish with `LIVE_RESUME_REPLAY_OK`. The expected owner-local projection and unchanged synthetic seed are asserted without model credentials. This is separate from scripted integration.

## Installed browser and real model evidence

The real Web profile installed the packed plugin through the public CLI. CUA verified template creation, layer visibility/lock, text link properties, front ordering, undo/redo, adding a second page, named-version save/preview, Markdown import into editable layers, rename, duplication and applying another template. On the final candidate, an acknowledged save reopened directly without a false recovery prompt; an unsaved draft reopened with explicit recovery choices and recovered its changed layer.

The user's existing `deepseek-v4.1-flash` configuration ran ordinary logged Session `session-58c3045c-a271-40b9-a256-efad75c537d7`. The editor supplied document identity/revision, the model read it and created persistent proposals, the browser displayed before/after previews, and a follow-up applied a combined proposal. The model refined the introduction without adding facts and changed the synthetic name to `林然｜智能体验证`. Later image/layout edits and exports exercised the final candidate. Credentials stayed in Harness storage and were not copied into source or release artifacts.

| Artifact at committed revision 14 | Independent inspection |
|---|---|
| PDF, 158358 bytes | Two A4 pages; Poppler renders the actual updated Chinese name, refined introduction, restored skills and blue image. pypdf verifies the retained `https://example.test/portfolio` link. |
| First-page PNG, 223945 bytes | 1588 × 2246 pixels; 25600 blue pixels confirm image content survived rendering. |
| JSON, 15884 bytes | Parsed backup equals the actual committed document, retaining two pages, image bytes, layout and link fields. |

Earlier long repeated base64 image text was copied incorrectly during model testing; successful export receipts alone did not prove image fidelity. Final inspection used a distinct CRC-valid short PNG and verified actual raster pixels and PDF appearance. This is why both decoded metadata and visual/content checks are recorded.

The redesigned management workspace was inspected in the installed browser at 1280 × 1000 and 390 × 844: real first-page thumbnails, no-result search, clear-search focus, name ordering, copy/open/rename and persistent card actions worked. Both Harness light and dark appearances were inspected; the original light preference was restored. Reduced-motion behavior is implemented in scoped media rules; no operating-system motion preference was changed during acceptance.

In the later turn of Session `session-85af7729-f1e0-4b91-a7d3-c048e4286955`, the configured real model copied the existing image through its `resume-asset:` reference into a new group on page two, proposed/applied revision 2 → 3, and exported PDF/PNG/JSON. Independent checks verify exact image bytes, an unchanged first page, JSON equal to the committed document, two PDF pages with the original URI, and 25600 blue pixels in the 1588 × 2246 second-page PNG. Poppler rendered the copied image on PDF page two.

The final candidate 11 was installed through the public CLI and loaded at `http://127.0.0.1:58358/`. A new real model Session `session-47df354f-686f-4082-bba1-7cd7ae858f11` was launched from the editor assistant: it read the copied image and exported revision-4 JSON through two ordinary tools, finishing with `FINAL_RESUME_DEMO_OK`. The same-run four-frame GIF records the management workspace, complete editor/assistant and actual tool receipt. The build contains the reviewed preview cancellation ownership fix; repeated cancellation/failure regression checks leave zero retained Konva shapes. Browser session storage is reused as an explicit recording isolation exception; the test profile and synthetic documents remain separate from normal user profiles.


## Delete confirmation refinement

The later delete-dialog refinement passed `npm run build --workspaces=false`, followed by the latest browser artifact build and both compiler-face checks. Focused `tests/browser/forms.test.ts` and `tests/browser/library.test.ts` passed 11 tests, including three new deletion cases: safe initial focus/dismissal/focus return, pending and failure containment, and selected-revision success. The preceding 158-test integration baseline was not repeated for this local UI change.

The actual packed plugin was reinstalled through the public CLI. CUA inspected light/dark appearances at 1280 × 720 and the 390 × 844 layout. The dialog measured 480px with a 48px emblem on desktop and 310px with a 42px emblem on the narrow viewport; narrow scroll/client widths were both 308px. Cancel receives initial focus, Tab wraps inside, and Escape returns focus to the initiating delete button. Normal action-text contrast is 5.48:1; hover increases it. Browser checks only opened and cancelled confirmations; no resume was deleted. Scoped review findings about emblem sizing and contrast were repaired and re-reviewed. The original light appearance and viewport were restored.

## Compact editor and thumbnail history

The editor refinement built the self-contained HTML, then passed both compiler faces and the strict NodeNext artifact consumer. The initial focused run passed 36 tests in eight files. After the keyboard/footer fix, 22 tests in four affected files passed; the final named-selection race fix passed 14 tests in `tests/browser/versions.test.ts` and `tests/browser/modal-canvas-keyboard.test.ts`, followed by another successful artifact build and both face checks. The final HTML contains 2,041,520 characters. The earlier 158-test integration baseline was not repeated for this UI change.

History previews use actual immutable saved pages, a serial cancellable queue, and visible-card work. Regression coverage includes stale reads/renders, selection and paging, dirty/conflict/recovery restore guards, mutation ownership, and the actual CanvasWorkspace keyboard listener. Modal keys cannot move/delete live layers. The named-save regression reproduces both response orders between the save query and parent revision refresh; the acknowledged new version is selected while later manual selection is preserved. Scoped review accepted both fixes.

The packed `dsh-fast-resume@0.1.0` was installed through the public `dsh plugin --profile web add <tarball> --offline` command using the isolated Web profile. CUA confirmed one back-icon Resume space action, no duplicated top Save/History/Properties text actions, and accessible lower-right panel icons. At 390 × 844, the editor frame measured 334px client and scroll width; both panel controls remained visible and operated independently. The history modal supports outer scrolling to Restore on narrow screens; at 1280 × 720 the restore footer remained inside the visible modal. Light/dark appearances and actual classic/business thumbnails were inspected; the original light appearance and normal viewport were restored.

Only the synthetic document `45d45fae-a145-418f-bedb-0b9e5cf279b9` was saved/restored. Named saving produced revision 7 and automatically selected its new card/detail. Restoring the saved two-page revision 4 produced revision 8, retained all eight versions, and matched the saved pages, page settings and template exactly. Page-two preview and returning to page one left the committed document unchanged. Screenshots and the detailed checklist are retained in the workspace under `.playwright-mcp/resume-editor-history/`; the current UI task did not repeat real-model testing or create a new model-demo GIF.

## Collapsible resizable sidebars

On 2026-10-19 the sidebar refinement passed 16 focused tests in `tests/browser/editor-panels.test.ts`, `editor-chrome.test.ts`, `modal-canvas-keyboard.test.ts` and `forms.test.ts`. Tests load the real library browser distribution and the actual CanvasWorkspace keyboard listener with scoped geometry fixtures. They cover native snap, remembered widths, initially hidden combinations, retained content/canvas identity, toolbar and shortcut synchronization, and keyboard ownership. The artifact build produced 2,042,947 HTML characters; both compiler faces passed afterward. Scoped six-file review found no actionable issue.

The actual tarball was reinstalled through the public CLI. At 1280 × 900, CUA dragged both sidebars to zero, observed both toolbar actions become unpressed and the canvas reclaim 100% of panel space, reopened them, and verified toolbar width restoration at 30% left and 26% right. Dragging the right edge back reopened the panel. Both dividers support Enter; arrows and Delete on a focused divider left the selected live name at X60/Y32. At 390 × 844, both sides could collapse independently; the frame client/scroll widths stayed 334px and the canvas received 326px after the two 4px handles. After all actions and viewport changes, the complete stored file hash still equalled the pre-test revision-8 baseline.

Native pointer snapping occurs past 7.5% on the left and 8% on the right, halfway from zero to the existing 15%/16% minimum expanded sizes. Gradual dragging can therefore remember the last minimum expanded size. Width memory lasts for the mounted workspace; no new persisted setting, viewport breakpoint, dependency, Host or document-format change was introduced. The normal viewport was restored; the latest installed Web server remains available. Screenshots and the acceptance record are in `.playwright-mcp/resume-panels/`.

## Registry release verification

On 2026-10-19, the final source was copied to an independent Git checkout and installed with Node 24.15.0 and `npm ci --workspaces=false --ignore-scripts` against the official npm registry. The lockfile uses official registry URLs. Only root build directories are ignored; retained upstream `src/lib` files are included in Git.

`npm run build --workspaces=false` passed the artifact build and both compiler faces. `node node_modules/vitest/vitest.mjs run tests upstream --maxWorkers=1` passed 43 files and 185 tests. The strict NodeNext consumer and publication-content check passed. The packed artifact contains 55 files and includes licenses, locales, installation patch and the self-contained editor.

With pnpm 11.28.5 and the published Harness runtime, `scripts/verify-harness.mjs` passed six actual Session tool calls, export validation, uninstall/reinstall retention and disable/re-enable retention. `scripts/verify-recorded-session.mjs` passed the recorded live Session replay with the installed `resume_read` tool and expected image-byte redaction. These checks use isolated temporary profiles without model credentials.

`npm audit --omit=dev` reports four existing dependency advisories: one high (`pdfjs-dist`) and three moderate (`mammoth`, `argparse`, `sprintf-js`). This release retains the reviewed dependency versions; it does not claim a clean security audit.

## Limits and delivery

Browser file-chooser interception in the available automation did not produce a file event, so GUI JSON/DOCX/PDF file selection is not claimed as exercised. Their actual Host import paths and recursive JSON/history round trips passed automated tests; the GUI Markdown import ran through the same installed bridge. Narrow and wider editor layouts were observed; all six templates and every element interaction were not exhaustively exercised in the browser. Concurrent browser conflict and Desktop interaction coverage are limited to the focused state/lifecycle tests unless separately recorded.

The package preserves PolyForm Noncommercial 1.0.0, attribution and commercial-license requirements. The development acceptance above did not include npm publication, Git submission or a pull request. The deliverable is the independent source project plus a locally installable npm tarball; registry installation applies only after its owner publishes the package.
