---
description: Scaffold a new Tauri IPC command following the 7-step hexagonal checklist from ARCHITECTURE.md.
argument-hint: <command_name> [feature_family]
---

Create a new Tauri command end-to-end. Argument: `$ARGUMENTS` (command name, optional feature family).

Follow this checklist exactly — do not skip steps, do not bundle steps:

1. **Domain type** — add/extend types in `crates/core/src/domain/<feature>.rs`. Pure data, no IO.
2. **Port** — declare a trait in `crates/core/src/ports/<concern>.rs` (or extend an existing one). Use `async_trait`. One concern per port.
3. **Use case** — implement free function(s) in `crates/core/src/application/<feature>/*.rs` taking a ports bundle struct composed of `Arc<dyn ...>` dependencies (one struct per feature module, not raw `Arc<dyn Port>` arguments). Add a unit test in `crates/core/tests/` using an in-memory fake.
4. **Adapter** — implement the port in `crates/infra/src/<family>/*.rs`. If shelling out, route through `infra::process`. Add an integration test gated with `#[ignore]`.
5. **IPC command** — add `#[tauri::command]` in `crates/ipc/src/commands/<feature>.rs` (~5 lines). DTO in `crates/ipc/src/dto.rs`. Register in `ipc::register`.
6. **Frontend contract** — add the typed entry to `src/shared/ipc/contract.ts` and a client helper. Map errors via `src/shared/ipc/errors.ts`.
7. **Capabilities** — extend `src-tauri/capabilities/default.json` if a new permission is needed. Never grant `shell:allow-execute`.

After scaffolding:
- Run `cargo check --workspace` and `cargo test -p markdown_reviewer_core`.
- Run `bunx tsc --noEmit` and `bunx biome check --apply` on edited TS files.
- Report which files changed and where the user should plug the command into the UI.

Delegate Rust-side review to the `rust-core-architect` sub-agent before declaring done.
