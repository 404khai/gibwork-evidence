# Read-only live test prerequisites

No API key is required by this prototype. The SDK authenticates with a Solana wallet message signature. A public address alone cannot authenticate. Do not send a private key, seed phrase or wallet export to the assistant or commit one.

Needed from the owner/organizer:

1. A stage task UUID that the participant is authorized to read.
2. Confirmation that stage reads and authentication require no spending or deposits.
3. A trusted, owner-controlled signer adapter implementing the SDK `WalletSigner` interface. `createSigner()` must return a Solana `publicKey`, `signMessage(bytes)` returning the approved signature bytes, and `signTransaction`. The tool disables transaction signing. The owner reviews and approves the authentication message through their signer.

Use an existing legitimate wallet connection or custody integration that supports message signing. The prototype does not implement a browser-wallet bridge or key custody. A standalone terminal cannot automatically reach an unrelated mobile wallet; the adapter must actually connect to the owner's signer. Do not substitute the fixture signer for live authentication.

After the owner has supplied that local adapter, follow the README `pack --adapter ... --environment stage` example with a clean implementation checkout and evidence plan. Expect stage to remain a review blocker. Record only a sanitized task-read result; never publish authentication headers, signatures or adapter credentials. A 403 is a failed access test, not successful integration. The CLI has no live submission or transfer operation.

This prerequisite is separate from the submission fee: a successful free read does not waive the SDK's documented 0.15 USDC submission charge.
