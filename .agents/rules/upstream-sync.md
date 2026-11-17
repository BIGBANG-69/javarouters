# Upstream Sync Rules (JavaRouters)

JavaRouters is a fork of new-api with one traffic path:

```
customer -> JavaRouters -> InferHub
```

There are no other providers. Upstream new-api serves 40+ providers, plugins, media and payment features, so most of its commits do not apply here. Take only the ones that touch the path above.

## How to sync

- Never `git merge upstream/main`. Review `git log <last reviewed>..upstream/main` and `git cherry-pick -x` only the commits that pass the filter below, oldest first, on a branch named `chore/upstream-fixes-<date>`.
- When a picked commit's test file pulls in helpers from a feature we did not take, keep the test for the picked behavior and drop the unrelated helpers. Drop locale keys that only the skipped feature uses.
- Verify with `go build ./...`, the tests of the touched packages, and the frontend typecheck. Database-touching picks still follow the database rules in `AGENTS.md`; production runs PostgreSQL.
- Update **Last reviewed upstream commit** below, even when nothing was taken, so the next review starts there.
- Tell the user which commits were taken and which were skipped, one line each, before pushing to `main` (a push to `main` deploys to production).

## Current setup (checked on production 2026-11-17)

| Channel | Type | Models |
|---|---|---|
| 1 InferHub - Claude | Anthropic (14) | `claude-*` |
| 2 InferHub - GPT | OpenAI (1) | `gpt-5*`, `gpt-6*` |
| 3 InferHub - Gemini | OpenAI (1) | `gemini-*` |
| 4 InferHub - Grok | OpenAI (1) | `grok-4*` |
| 5 InferHub - Open Source | OpenAI (1) | deepseek, kimi, glm, qwen3, minimax and others |

- Text models only. Image, video, audio and task models are not sold.
- No payment gateway and no OAuth login provider is enabled. Sign-in is password or passkey.
- Main database PostgreSQL 15, cache Redis 7, deployed as a Docker image built by `.github/workflows/javarouters-image.yml`.

Re-check this table when a channel type, a payment gateway or a login provider changes, and update the filter accordingly.

## Take

- Security fixes anywhere in code we run: authentication, sessions, tokens and API keys, passkeys, access control, input validation, secrets in logs or responses.
- Relay core for text: request routing, retries, channel selection, channel auto-disable and recovery, error mapping, streaming, usage and token counting.
- The OpenAI (1) and Anthropic (14) channel adaptors.
- Protocol conversions between OpenAI Chat Completions, OpenAI Responses and Claude Messages, in both directions. Customers may call any of these endpoints for any model.
- Billing and quota for text models, pricing, users, tokens, groups, redemption codes, logs and the console pages customers and admins use.
- PostgreSQL and Redis fixes, Docker image and build fixes, Go and frontend dependency updates that fix a security issue.

## Skip

- Adaptors and conversions for every other provider and channel type (for example Gemini-native, DeepSeek, Vertex, Bedrock, Azure, Ali, Doubao), unless a channel above changes to that type.
- Task plugins, request and provider plugins, plugin marketplace, moejs and moego.
- Image, video, audio, Midjourney, Suno and other task or media models.
- Payment gateways (epay, Stripe, Creem and others) and OAuth or OIDC login providers, until one is enabled.
- SQLite-only and MySQL-only fixes, Electron desktop, `docs/`, GitHub templates and workflows, release tooling.
- New features that the setup above does not use, and their translations.
- Dependency upgrades with no security reason (they cause large lock-file conflicts).

When a commit is unclear, read its diff: if it changes code that a request on the path above executes, take it.

## Last reviewed upstream commit

`669d77497` fix(relaykit): map Gemini 4 thinking levels per model (#8367), reviewed 2026-11-17.

Taken on 2026-11-17: `433830b4e`, `ada15c050`, `48a6c87f9`, `6ef123cd5`, `1c63cc8c9`, `ce8fc49e4`.
