# GibWork Evidence — submission draft

Prepared for 404khai. Not posted.

GibWork Evidence is a terminal-only coding-bounty review workflow. It uses the official TypeScript SDK task reader to combine task scope with a pinned Git commit, explicit source/artifact allowlists, check logs, a requirement map and file hashes. It produces a portable review packet and a verification command. Failed checks, stale commits and missing deliverables remain visible; successful packaging is not represented as bounty approval or payment.

The included offline demo runs three real regression cases in a synthetic implementation repository, exercises the actual SDK with a fixture transport, exports the packet, verifies it, and detects a changed packaged file. A live SDK adapter interface is included; live wallet access has not been tested. The demo is labeled offline throughout.

Implemented with OpenAI Codex assistance. Reviewed and locally tested. No paid API, key export, gas spend, deposit or participation fee was used.

Source: https://github.com/404khai/gibwork-evidence

Demo video, screenshot, terminal recording and portable example packet: https://github.com/404khai/gibwork-evidence/releases/tag/v0.1.0

Validation: `npm test` (20 passing tests), `npm run typecheck`, `npm run demo` (3 real regression tests in the synthetic implementation with a local execution receipt), independent CLI pack/verify, and visual inspection of the 20-second H.264 terminal replay (1280 × 1000). See `REQUIREMENTS_AUDIT.md` for the candid requirements assessment, including the thin single-read SDK integration and lack of live validation.

Deliverable checklist before posting:

- [ ] Organizer confirms this scope is distinct from existing entries.
- [x] Public source repository URL.
- [x] Demo video URL, screenshot and exported example packet.
- [ ] Attend and truthfully record two required Discord sessions.
- [ ] Confirm Nigeria payout eligibility and actual Solana receiving setup.
- [ ] Confirm a fee-free submission route; current SDK docs quote 0.15 USDC.

No reward, selection of this implementation, payout or fee waiver is claimed.
