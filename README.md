# GibWork Evidence

A terminal tool for turning a coding-bounty implementation into a reviewable evidence packet. It reads a task through the official GibWork SDK and combines it with a pinned Git commit, explicitly selected source files, test logs and a requirement map. It catches missing deliverables, stale or failed checks and changes to packaged files before a reviewer spends time reconstructing the evidence.

Built for the GibWork Developer Hackathon by 404khai, with OpenAI Codex assistance. The demo and tests use offline fixtures. No live wallet, payment, submission or production acceptance has been verified.

[Demo video and screenshot](https://github.com/404khai/gibwork-evidence/releases/tag/v0.1.0) · [Requirements critique](REQUIREMENTS_AUDIT.md) · [Live test prerequisites](LIVE_TESTS.md)

## Run the free offline demo

Requires Node.js 22.18+ (tested with Node 26.5), npm and Git. No account, wallet, credentials, paid API or running server is needed.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
```

The demo creates a synthetic Git repository, executes three real regression tests, reads a synthetic task with the actual `@gibwork/sdk` client through an in-memory transport, packs the evidence, verifies it and demonstrates detection of a modified artifact. It restores the file before finishing. Temporary output paths are printed and recorded in `demo-output/latest.json`.

Expected output includes:

```text
Tests: 3 passed, exit 0
Evidence status: incomplete
BLOCKER: Task source is an offline SDK fixture, not a live eligibility check
BLOCKER: Requirement recording lacks artifact: demo.mp4
Verify the packet: PASS
Change a packaged file: DETECTED (Integrity mismatch: add.mjs)
Submission: not sent. Eligibility, acceptance and payout: unverified.
```

An incomplete demo packet is intentional: it shows a missing video requirement without inventing proof. The fixture task and its reward amounts are synthetic; they do not establish an available bounty or earnings.

## Package your own evidence

To capture an actual terminal run and render a readable demo replay (optional, local only):

```sh
node scripts/record-demo.mjs
python3 -m venv .render-venv
.render-venv/bin/python -m pip install Pillow
.render-venv/bin/python scripts/render-demo.py
```

The renderer additionally needs ffmpeg and the macOS Menlo font. It writes `demo-output/demo.cast`, `demo.mp4`, and `terminal-replay.png`. The video is a readable replay of captured output, labeled as offline; no fabricated terminal results or live API footage are added. Other systems can replay the `.cast` with an asciicast-compatible player or change the renderer's font path.

Use the repository root, a new output directory, a task fixture and an evidence plan:

```sh
npm run build
node dist/cli.js pack \
  --task 00000000-0000-4000-8000-000000000001 \
  --fixture examples/task.json \
  --repo /absolute/path/to/implementation \
  --plan /absolute/path/to/evidence.json \
  --out /absolute/path/to/new-packet
node dist/cli.js verify --packet /absolute/path/to/new-packet
```

`evidence.json` has this shape (replace the commit with your actual tested HEAD):

```json
{
  "artifacts": ["src/fix.ts", "test/fix.test.ts"],
  "checks": [
    {
      "name": "regression",
      "command": "npm test",
      "exitCode": 0,
      "commit": "ACTUAL_TESTED_GIT_COMMIT_SHA",
      "log": "evidence/tests.log"
    }
  ],
  "requirements": [
    {
      "id": "fix-with-tests",
      "description": "Fix the reported behavior and prove it with regression cases",
      "artifacts": ["src/fix.ts", "test/fix.test.ts"],
      "checks": ["regression"]
    },
    {
      "id": "demo",
      "description": "Provide the requested demonstration",
      "artifacts": ["evidence/demo.mp4"],
      "checks": []
    }
  ]
}
```

Capture the actual test output after pinning the commit. For an explicit owner-selected command, the CLI can record a local execution receipt:

```sh
node dist/cli.js capture --repo /absolute/path/to/implementation \
  --out /absolute/path/to/new-capture -- node --test
```

This writes `checks.log` and `receipt.json`, recording argv, actual exit, timeout/error state, log digest, and Git state before/after. It uses no shell, caps output at 1 MiB, and times out after 30 seconds. The output must be outside the implementation checkout or Git-ignored. Copy these into an ignored evidence directory and include the receipt as an artifact; fill the plan using the recorded facts. Capture exits 2 for a failed, interrupted or dirty run. The demo uses this runner for its regression cases.

Logs may live in a Git-ignored evidence directory; they are hashed and copied into the packet but not represented as committed source. The CLI does not execute commands in a plan or task. Check commands, exit codes, commit identities and requirement mappings are author-provided assertions, explicitly labeled that way. A local receipt is unsigned, editable and not automatically trusted by the packager. A reviewer must evaluate authenticity and scope coverage. A checksum cannot prove that a test ran. Capture is not a sandbox; see the critique for its limits.

`pack` exits **0** for evidence ready for human review, **2** for a packet with review blockers, and **1** for a failure that prevented packing. `verify` exits **0** when the saved bytes match, **1** on failure. A fixture or stage task always produces a review blocker. An existing output directory is never overwritten.

## Read a real task with the SDK

SDK integration is central: `src/task.ts` constructs `GibworkClient` and calls `tasks.get`, including SDK authentication, environment routing, timeout and HTTP error behavior. The offline demo replaces only the transport and uses a dummy fixture signer; its signature is not a genuine wallet signature and is never sent anywhere.

For legitimate stage/production use, provide an owner-controlled wallet-adapter or custody-provider module exporting `createSigner(): Promise<WalletSigner>`. This is an executable module you must trust, not data from a task. It should expose the wallet's public key and owner-approved message signing. No key file, private-key environment variable or seed phrase is required by this tool. See the official [SDK instructions](https://www.npmjs.com/package/@gibwork/sdk) for the signer interface.

```sh
node dist/cli.js pack \
  --task YOUR_TASK_UUID \
  --adapter /absolute/path/to/your/trusted-signer.mjs \
  --environment stage \
  --repo /absolute/path/to/implementation \
  --plan /absolute/path/to/evidence.json \
  --out /absolute/path/to/new-packet
```

Stage is the default; production requires `--environment production`. Only task reads occur. Transaction signing is disabled even on a supplied signer. The tool exposes no submission, approval, bounty-creation, refund or transfer command. Live reads have not been executed in this prototype. Confirm authorized SDK access with GibWork before connecting a live wallet.

The published SDK README says discovery is free but creating a work submission currently charges **0.15 USDC**, with sponsored network costs. That is incompatible with this project's $0 spending constraint unless the organizer supplies a fee-free submission route. This tool does not pay that fee or promise a waiver. SDK task amounts are preserved without unit conversion; the original allocation is not remaining funds or a guaranteed individual reward.

## Packet contents and verification limits

- `manifest.json`: task source and digest, commit, dirty flag, checks, file hashes, requirement evidence and blockers.
- `report.md`: a concise reviewer checklist using the same facts.
- `files/`: copies of explicitly selected artifacts and check logs.
- `integrity.json`: digests of the manifest and report.

The packager rejects parent traversal, absolute paths, symlinks, credential filenames, `.env`, `.git`, `.private`, dependency directories and files larger than 10 MiB. It checks common secret patterns in artifacts, logs and metadata. This is a conservative guard, not a guarantee against all secret formats; review the allowlist and generated packet before sharing. Missing files or unsafe paths stop packaging. A dirty checkout, failed/stale check, missing mapped deliverable, closed/expired task or offline task source blocks readiness.

Hashes detect changed bytes relative to the included integrity index. An attacker who rewrites both data and hashes can forge a new index: this is **not an author signature** or a trust authority. Preserve or sign the index through your own verified signing setup before relying on provenance. Source and artifact files are re-read while packing to detect concurrent modifications; use a stable checkout.

Requirement mappings are explicit because arbitrary task prose cannot safely be translated into authoritative acceptance rules. The SDK task text remains untrusted data. Nothing in it is run as code. Even a complete map says only `ready-for-human-review`; eligibility, acceptance and payout remain `unverified`.

## Hackathon deliverables and status

The proposed non-web workflow is reproducible coding evidence handoff and verification. Organizers still need to confirm novelty against other entries and that the task-read integration satisfies their core SDK requirement.

The repository supplies TypeScript source, SDK integration, tests, setup instructions and a reproducible terminal demo. Public video, screenshot, recording and example-packet downloads are in the linked release. Live validation and required attendance at two Discord sessions remain submission items. Do not claim sessions you have not attended.

## Dependencies and attribution

`@gibwork/sdk` is pinned to 0.2.0. Its package metadata says `UNLICENSED`; this repository contains our integration, not copied SDK source. The hackathon expressly invites SDK use. Obtain GibWork's guidance for broader distribution; dependencies are installed from npm and are not vendored or relicensed here. Third-party dependencies retain their own terms.
