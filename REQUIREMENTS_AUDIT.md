# Requirements critique

Assessment for the [GibWork Developer Hackathon](https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa), based on the listing inspected October 7, 2026 and organizer messages supplied by the participant. This is an author assessment, not organizer approval.

| Requirement | Evidence and assessment |
| --- | --- |
| Hackathon role before building | Participant reports receiving the role before this build. Not independently verified. |
| New, useful, non-web SDK/CLI/MCP workflow | Terminal evidence capture, task-aware review packets and byte verification are implemented. Distinctness from competing entries is unconfirmed. |
| Meaningful GibWork integration | Actual `GibworkClient.tasks.get` with environment selection and error handling. Only the transport is substituted offline. **Weakest technical area:** a single task read may be judged too thin; no authenticated live request has succeeded. |
| Working, organized prototype | TypeScript CLI, bounded explicit check runner, validation, deterministic packing, verification and automated regression tests. Offline workflow runs end to end. |
| Public source and README with setup/examples | [GitHub repository](https://github.com/404khai/gibwork-evidence). README includes reproducible offline and live-interface examples. |
| Demo video URL, screenshots and deliverables | [Release assets](https://github.com/404khai/gibwork-evidence/releases/tag/v0.1.0): actual terminal replay, screenshot, recording and sample packet. Demonstration uses a deliberately simple synthetic addition task, not a real accepted bounty. |
| Two Discord sessions | Attendance is not established. Organizer's supplied September 29 message says the second session had not happened. It does not waive the requirement. |
| Submission by deadline | Inspected listing states October 30, 2026. No hackathon submission has been sent. |

## What the prototype does not prove

The packager checks evidence presence and byte consistency. It does not judge whether code satisfies natural-language task requirements. Check metadata remains caller-supplied even when a local capture receipt is included; unsigned receipts can be edited or forged. A checksum index can be rewritten. These are review aids, not independent attestation or a cryptographic author signature. Source commits include a DCO sign-off, not a cryptographic signature.

The capture command executes explicit owner-selected argv with no shell, a 30-second timeout and a 1 MiB output limit. It is not a sandbox, and descendant processes are not guaranteed to terminate. It preserves stdout followed by stderr, not their original interleaving. It checks Git state before and after, but does not detect a file temporarily changed and restored during execution. Review and trust the command before running it.

The demo's three addition cases demonstrate packaging, not task complexity or market demand. SDK authentication uses a dummy signer in the fixture and proves no live access. The trusted live signer interface needs a real integration test. Secret-pattern filters cannot catch every credential format. The video renderer currently depends on a macOS font; the core CLI and offline checks do not.

## Payment and eligibility gaps

The current SDK 0.2.0 README quotes **0.15 USDC per work submission** and sponsored network costs. Strict $0 spending therefore requires an organizer-confirmed free submission route before submitting. No fee waiver is assumed. The inspected bounty shows a shared 1,000 USDC allocation and minimum 50 per approved submission, not a guaranteed reward for this entry.

Nigeria eligibility, owner-controlled Solana receiving setup, approval and payout are unverified. An EVM address does not establish a compatible Solana recipient. Spend and verified earnings: **$0**.

## Next acceptance work

Obtain organizer confirmation that evidence packaging is distinct and sufficiently SDK-focused, the remaining session arrangements and fee-free submission route. Then execute a read-only stage task request through an owner-approved Solana signer, publish the sanitized result, and improve the demo using that task if permitted. Never put a private key, seed phrase or wallet export in this repository or chat. Submit only when the participation and zero-cost conditions are satisfied.
