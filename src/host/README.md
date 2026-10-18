# Fast Resume Host

The service stores complete validated document envelopes under the selected profile's `data/fast-resume`. Cross-process locks serialize revision checks and atomic replacement; drafts, proposals and version restores share the same committed revision. Proposal request ids and mutation receipts survive service restarts. Reverting a proposal preserves unrelated later fields and rejects overlapping edits.

The generated `./remote` contribution exposes `fastResume` methods to authenticated Clients. Document and operation payloads use JSON strings to preserve the original recursive editor model. `FAST_RESUME_ERROR` details identify operational failures and current revisions on conflicts. Tools register in each normal Agent scope and log through the existing Harness tool pipeline.

JSON exports run on the Host. PDF/PNG jobs require a connected renewable renderer lease, exact committed document data, a bounded deadline, and fully decoded binary bytes with matching page count and dimensions. PNG dimensions use the explicit job pixel ratio; receipts identify pixels or millimeters. No artifact receipt exists until the Host stores the bytes. Client disposal, cancellation, lease expiry and timeouts reject pending exports.

Run `npm --workspaces=false run build:artifacts`, then `npm --workspaces=false run build:check`, and `npm --workspaces=false test`. The standalone build stages the public Typert analyzer in a temporary workspace and emits actual Host/Remote metadata. `node scripts/check-consumer.mjs` checks the installed declaration layout under strict NodeNext without plugin sources or compiler aliases.
