# Recorded image-layer read

The first turn of actual Web Session `session-85af7729-f1e0-4b91-a7d3-c048e4286955` was recorded on 2026-10-18 with the user-configured DeepSeek-V4.1-Flash model and installed candidate 10. It reads one image layer of an explicitly synthetic resume and completes with `LIVE_RESUME_REPLAY_OK`. The later asset-copy/export turn is excluded.

`session.v4.jsonl` preserves the recorded assistant streams, tool arguments and results. Projection removes persistence sequence/time envelopes, replaces the current system prompt and tool catalog with repository fixture tokens, normalizes the Session id consistently (including delivery markers), and replaces the recording workspace path with `{{cwd}}`. It does not replace the model stream with scripted tool calls. No model credentials are included.

`resume.json` is the exact synthetic committed envelope before this read. `prompt.txt` is the actual first user prompt. `expected.json` records the owner-local tool/result projection. Run `npm run test:snapshot -- <tarball>` with explicit `DSH_TEST_CLI` and `DSH_TEST_REPLAY`; the verifier installs the package, seeds this document and derives the two replay calls through the official Session-format reader. It asserts the real installed tool result, byte redaction, final sentinel and unchanged seed. Optional `--offline` requires a populated package cache.

Raw first-turn recording SHA-256: `e9d543f3a252050d406e8bd0f06c1ab14dbdf58a0fd8827758cf4b87622cc0d6`.
