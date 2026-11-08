# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Developers and startups building AI features who want one API key and lower prices than the official providers.
- People using AI coding tools (Claude Code, Cursor, Cline and similar) who need an OpenAI- or Anthropic-compatible key.
- Companies and institutions that give internal teams access to AI models.
- Resellers who resell AI model access to their own customers.

Most visitors are in Indonesia and read Indonesian.

## Product Purpose

JavaRouters is an AI API gateway: one account and one API key reach many AI models (Claude, GPT, Gemini, Grok, DeepSeek, Kimi, Qwen, GLM, MiniMax and more) through endpoints compatible with the OpenAI and Anthropic APIs. Users top up a balance, create keys and pay per use. Success is a visitor creating an account, topping up and sending their first request.

## Positioning

- About 30% cheaper than the providers' official prices: input and output are sold at 70% of the official price, kept true automatically by the hourly price sync.
- One API and one key for many model families, with OpenAI- and Anthropic-compatible endpoints, so existing SDKs and coding tools work by changing the base URL.

## Operating Context

- Live at https://javarouters.talentadigitalkudus.id; the public model list and prices come from the gateway's own `/api/pricing`.
- Models are sourced from InferHub and synced hourly; the sold list changes as upstream sellers come and go (about 89 text models at the time of writing). Image and video models are not sold yet.
- Visitors evaluate by reading the model list and prices, then sign up, top up and create a token in the console.

## Capabilities and Constraints

- Built on New API (QuantumNous/new-api, AGPLv3). The New API attribution text and link must stay visible in the UI, LICENSE/NOTICE stay intact, and the modified source must remain available (repo BIGBANG-69/javarouters is public). The project policy also forbids removing new-api / QuantumNous identifiers from code and metadata.
- No Rupiah payment gateway is active yet; do not claim payment in Rupiah, QRIS or bank transfer until it exists.
- Model counts and prices are dynamic; show live data rather than hard-coded numbers.
- Never name server locations, hosting providers or other infrastructure details in public copy, docs or the usage statistics.
- Web console UI keeps the upstream layout; the public pages are the JavaRouters-specific surface.

## Brand Commitments

- Name: JavaRouters (the system name setting currently reads "Java routers").
- Color direction already chosen by the user: emerald green on white, light mode by default.
- Primary language: Indonesian.
- Support contact: email (address to be provided by the user; do not invent one).

## Evidence on Hand

- Live model catalog and per-model prices via `/api/pricing`.
- Platform usage statistics (tokens processed, requests and success rate, average response time, most used models over the last 7 days) come live from the gateway's own usage records via `/api/public/stats`, aggregated across all users. They are shown only once the 7-day request count reaches an admin-set threshold, so the page never displays a thin week.
- No testimonials, customer logos, uptime figures or case studies exist; do not fabricate any.
- No JavaRouters logo yet (the default New API logo is in use until the user provides one).

## Product Principles

1. Prices and model availability shown to visitors must be the live, true numbers.
2. Make switching trivial: show that existing OpenAI/Anthropic SDKs and coding tools work by changing the base URL and key.
3. Speak plainly in Indonesian to developers and businesses; no hype or claims the product cannot back.
4. Keep the upstream attribution and AGPL obligations visible and intact.
