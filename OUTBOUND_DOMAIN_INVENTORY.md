# Outbound Domain Inventory (Exhaustive)

Generated: 2026-09-06T20:41:47.247Z

Repository: `decide`

This inventory includes all detected `http/https` outbound URLs across runtime code, frontend content, docs, and scripts in this repository.

Lockfiles and binary image assets are excluded to reduce noise.

## 1) Snapshot

- Total URL occurrences scanned: **3128**
- Valid URL occurrences parsed: **3116**
- Invalid/truncated URL occurrences: **12**
- Unique hosts: **245**
- Critical integration hosts: **15**
- First-party hosts: **10**
- Third-party hosts: **235**

### Risk-tier distribution

- T0-critical-runtime: 5
- T1-auth-billing: 4
- T1-observability: 1
- T1-platform-control: 5
- T2-first-party-surface: 8
- T3-content-static: 222

### Top hosts by URL occurrences

| Host | URL occurrences | Files | Risk tier | Tag(s) |
| --- | ---: | ---: | --- | --- |
| www.amazon.com | 111 | 21 | T3-content-static | third_party |
| api.decide.fyi | 99 | 29 | T2-first-party-surface | first_party |
| github.com | 93 | 16 | T1-platform-control | github, third_party |
| support.apple.com | 68 | 16 | T3-content-static | third_party |
| support.google.com | 53 | 18 | T3-content-static | third_party |
| help.crunchyroll.com | 38 | 16 | T3-content-static | third_party |
| www.masterclass.com | 38 | 20 | T3-content-static | third_party |
| proton.me | 36 | 20 | T3-content-static | third_party |
| ring.com | 36 | 20 | T3-content-static | third_party |
| www.decide.fyi | 35 | 21 | T2-first-party-surface | first_party |
| policy.decide.fyi | 34 | 20 | T2-first-party-surface | first_party |
| www.canva.com | 34 | 17 | T3-content-static | third_party |
| www.peacocktv.com | 34 | 18 | T3-content-static | third_party |
| www.shutterstock.com | 34 | 18 | T3-content-static | third_party |
| www.expressvpn.com | 33 | 17 | T3-content-static | third_party |
| www.help.tinder.com | 33 | 17 | T3-content-static | third_party |
| www.instacart.com | 32 | 16 | T3-content-static | third_party |
| www.mlb.com | 32 | 19 | T3-content-static | third_party |
| www.uber.com | 32 | 16 | T3-content-static | third_party |
| docs.midjourney.com | 31 | 17 | T3-content-static | third_party |

## 2) Critical Integration Domains

These are domains tagged as runtime/ops critical (`vercel`, `github`, `stripe`, `resend`, `uptimerobot`, `browserless`, `jina_mirror`, `gemini`, `clerk`, `supabase`, `axiom`, `calendly`, `cloudflare`).

| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |
| --- | ---: | ---: | --- | --- | --- | --- |
| github.com | 93 | 16 | config_or_data, data_source, docs_content, frontend, other | T1-platform-control (Platform/control-plane dependency.) | github, third_party | distribution/mcp-directories.json:20, distribution/mcp-directories.json:127, distribution/mcp-directories.json:211 |
| example.supabase.co | 8 | 4 | other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | supabase, third_party | scripts/test-mcp-adoption-api.js:33, scripts/test-mcp-telemetry.js:97, scripts/test-mcp-telemetry.js:108 |
| *.clerk.com | 3 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, third_party | vercel.json:34, vercel.json:34, vercel.json:34 |
| *.clerk.dev | 3 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, third_party | vercel.json:34, vercel.json:34, vercel.json:34 |
| api.axiom.co | 3 | 2 | other | T1-observability (Monitoring/logging dependency.) | axiom, third_party | lib/log.js:9, lib/metrics-axiom.js:65, lib/metrics-axiom.js:70 |
| production-sfo.browserless.io | 3 | 3 | docs_content, other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | browserless, third_party | README.md:603, api/policy-fetch-hook.js:276, scripts/test-policy-fetch-hook.js:116 |
| challenges.cloudflare.com | 2 | 1 | config_or_data | T1-platform-control (Platform/control-plane dependency.) | cloudflare, third_party | vercel.json:34, vercel.json:34 |
| generativelanguage.googleapis.com | 2 | 2 | config_or_data, other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | gemini, third_party | api/decide.js:500, vercel.json:34 |
| r.jina.ai | 2 | 2 | other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | jina_mirror, third_party | api/policy-fetch-hook.js:107, scripts/check-policies.js:3268 |
| raw.githubusercontent.com | 2 | 1 | docs_content | T1-platform-control (Platform/control-plane dependency.) | github, third_party | client/EXAMPLES.md:89, client/EXAMPLES.md:107 |
| *.vercel.app | 1 | 1 | config_or_data | T1-platform-control (Platform/control-plane dependency.) | third_party, vercel | vercel.json:34 |
| accounts.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, first_party | vercel.json:34 |
| api.cloudflare.com | 1 | 1 | other | T1-platform-control (Platform/control-plane dependency.) | cloudflare, third_party | api/policy-fetch-hook.js:201 |
| clerk.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, first_party | vercel.json:34 |
| evidence-test.supabase.co | 1 | 1 | other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | supabase, third_party | scripts/test-policy-evidence-snapshot.js:32 |

## 3) Full Host Inventory (Alphabetical, Exhaustive)

| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |
| --- | ---: | ---: | --- | --- | --- | --- |
| *.clerk.com | 3 | 1 | config_or_data | T1-auth-billing | clerk, third_party | vercel.json:34, vercel.json:34, vercel.json:34 |
| *.clerk.dev | 3 | 1 | config_or_data | T1-auth-billing | clerk, third_party | vercel.json:34, vercel.json:34, vercel.json:34 |
| *.vercel.app | 1 | 1 | config_or_data | T1-platform-control | third_party, vercel | vercel.json:34 |
| 127.0.0.1 | 1 | 1 | other | T3-content-static | third_party | Dockerfile:20 |
| 1password.com | 13 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:10, public/rules/policy-sources.json:10, public/rules/return-policy-sources.json:10 |
| accounts.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing | clerk, first_party | vercel.json:34 |
| alpha.example | 3 | 1 | other | T3-content-static | third_party | scripts/test-policy-coverage-scorecard.js:43, scripts/test-policy-coverage-scorecard.js:43, scripts/test-policy-coverage-scorecard.js:49 |
| api.axiom.co | 3 | 2 | other | T1-observability | axiom, third_party | lib/log.js:9, lib/metrics-axiom.js:65, lib/metrics-axiom.js:70 |
| api.cloudflare.com | 1 | 1 | other | T1-platform-control | cloudflare, third_party | api/policy-fetch-hook.js:201 |
| api.decide.fyi | 99 | 29 | config_or_data, docs_content, other | T2-first-party-surface | first_party | README.md:25, README.md:25, README.md:26 |
| attacker.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-policy-mcp.js:651 |
| beta.example | 2 | 1 | other | T3-content-static | third_party | scripts/test-policy-coverage-scorecard.js:44, scripts/test-policy-coverage-scorecard.js:50 |
| bitwarden.com | 20 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:63, public/rules/policy-sources.json:63, public/rules/return-policy-sources.json:63 |
| budget.example.test | 3 | 2 | other | T3-content-static | third_party | scripts/test-decision-contract.js:3255, scripts/test-decision-contract.js:3259, scripts/test-gemini-usage-budget.js:16 |
| bumble.com | 17 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:67, public/rules/policy-sources.json:67, public/rules/return-policy-sources.json:67 |
| cancel.decide.fyi | 10 | 5 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:208, README.md:235, README.md:251 |
| cdn.jsdelivr.net | 1 | 1 | config_or_data | T3-content-static | third_party | vercel.json:34 |
| challenges.cloudflare.com | 2 | 1 | config_or_data | T1-platform-control | cloudflare, third_party | vercel.json:34, vercel.json:34 |
| chatgpt.com | 1 | 1 | other | T3-content-static | third_party | lib/mcp-handler.js:13 |
| claude.ai | 7 | 7 | config_or_data, data_source, other | T3-content-static | third_party | distribution/mcp-directories.json:187, lib/mcp-handler.js:14, public/rules/trial-policy-sources.json:95 |
| clerk.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing | clerk, first_party | vercel.json:34 |
| coverage.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:335 |
| cursor.com | 2 | 2 | config_or_data, docs_content | T3-content-static | third_party | README.md:198, distribution/mcp-directories.json:199 |
| customercenter.wsj.com | 21 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:609, public/rules/cancel-policy-sources.json:612, public/rules/policy-sources.json:535 |
| decide.fyi | 5 | 4 | other | T2-first-party-surface | first_party | api/track.js:120, lib/policy-vendor-candidate-monitor.js:137, lib/policy-vendor-candidate-monitor.js:164 |
| dedicated.example.test | 2 | 1 | other | T3-content-static | third_party | scripts/test-gemini-usage-budget.js:114, scripts/test-gemini-usage-budget.js:120 |
| developers.openai.com | 1 | 1 | config_or_data | T3-content-static | third_party | chatgpt-app-submission.json:2 |
| discord.com | 21 | 18 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:133, public/rules/policy-sources.json:129, public/rules/return-policy-sources.json:129 |
| docs.github.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:201, public/rules/policy-sources.json:198, public/rules/return-policy-sources.json:198 |
| docs.keeper.io | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:290, rules/cancel-policy-semantic-state.json:1173 |
| docs.midjourney.com | 31 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:308, public/rules/cancel-policy-sources.json:311, public/rules/cancel-policy-sources.json:312 |
| en-americas-support.nintendo.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:320, rules/cancel-policy-confirmed-baseline.json:374, rules/cancel-policy-coverage-state.json:1011 |
| en.help.roblox.com | 13 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:557, public/rules/policy-sources.json:507, public/rules/return-policy-sources.json:507 |
| evernote.com | 20 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:176, public/rules/cancel-policy-sources.json:177, public/rules/policy-sources.json:173 |
| evidence-test.supabase.co | 1 | 1 | other | T0-critical-runtime | supabase, third_party | scripts/test-policy-evidence-snapshot.js:32 |
| example.com | 22 | 6 | docs_content, other | T3-content-static | third_party | README.md:588, scripts/test-check-policies.js:1051, scripts/test-check-policies.js:1052 |
| example.my.salesforce.com | 1 | 1 | other | T3-content-static | third_party | sdk/examples/crm-writeback.js:36 |
| example.supabase.co | 8 | 4 | other | T0-critical-runtime | supabase, third_party | scripts/test-mcp-adoption-api.js:33, scripts/test-mcp-telemetry.js:97, scripts/test-mcp-telemetry.js:108 |
| example.test | 1 | 1 | other | T3-content-static | third_party | scripts/test-policy-funnel.js:38 |
| fastmcp.me | 4 | 1 | docs_content | T3-content-static | third_party | README.md:198, README.md:198, README.md:198 |
| fonts.googleapis.com | 1 | 1 | config_or_data | T3-content-static | google_fonts, third_party | vercel.json:34 |
| fonts.gstatic.com | 1 | 1 | config_or_data | T3-content-static | google_fonts, third_party | vercel.json:34 |
| gamma.example | 2 | 1 | other | T3-content-static | third_party | scripts/test-policy-coverage-scorecard.js:74, scripts/test-policy-coverage-scorecard.js:75 |
| gemini-budget.contract.test | 1 | 1 | other | T3-content-static | third_party | scripts/test-decision-contract.js:37 |
| generativelanguage.googleapis.com | 2 | 2 | config_or_data, other | T0-critical-runtime | gemini, third_party | api/decide.js:500, vercel.json:34 |
| github.com | 93 | 16 | config_or_data, data_source, docs_content, frontend, other | T1-platform-control | github, third_party | distribution/mcp-directories.json:20, distribution/mcp-directories.json:127, distribution/mcp-directories.json:211 |
| glama.ai | 2 | 2 | config_or_data | T3-content-static | third_party | distribution/mcp-directories.json:139, glama.json:2 |
| healthy.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:334 |
| hellofreshusa.zendesk.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:231, public/rules/return-policy-sources.json:231, rules/policy-confirmed-baseline.json:276 |
| help.audible.com | 13 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:55, public/rules/cancel-policy-sources.json:59, public/rules/policy-sources.json:59 |
| help.britbox.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:87, rules/cancel-policy-semantic-state.json:1667 |
| help.clickup.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:23, docs/reviews/policy-candidate-applicability-20260906.md:23, rules/policy-vendor-candidates.json:368 |
| help.crunchyroll.com | 38 | 16 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:111, public/rules/cancel-policy-sources.json:120, public/rules/cancel-policy-sources.json:121 |
| help.discoveryplus.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:655, rules/cancel-policy-confirmed-baseline.json:157, rules/cancel-policy-semantic-state.json:1418 |
| help.disneyplus.com | 16 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:137, public/rules/policy-sources.json:141, public/rules/policy-sources.json:142 |
| help.doordash.com | 20 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:149, public/rules/policy-sources.json:146, public/rules/return-policy-sources.json:146 |
| help.dropbox.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:153, rules/cancel-policy-confirmed-baseline.json:171, rules/cancel-policy-coverage-state.json:520 |
| help.ea.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:561, rules/cancel-policy-confirmed-baseline.json:178, rules/cancel-policy-coverage-state.json:1747 |
| help.evernote.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:173, public/rules/policy-sources.json:170, public/rules/return-policy-sources.json:170 |
| help.example.com | 2 | 2 | other | T3-content-static | third_party | scripts/test-check-policies.js:950, scripts/test-policy-vendor-candidates.js:21 |
| help.hbomax.com | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:284, public/rules/return-policy-sources.json:284, rules/policy-confirmed-baseline.json:346 |
| help.headspace.com | 20 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:226, public/rules/cancel-policy-sources.json:229, public/rules/policy-sources.json:223 |
| help.hinge.co | 30 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:242, public/rules/cancel-policy-sources.json:245, public/rules/cancel-policy-sources.json:246 |
| help.hulu.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:250, rules/cancel-policy-confirmed-baseline.json:269, rules/cancel-policy-sources.json:250 |
| help.max.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:296, rules/cancel-policy-confirmed-baseline.json:325, rules/cancel-policy-coverage-state.json:869 |
| help.miro.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:44, docs/reviews/policy-candidate-applicability-20260906.md:29, rules/policy-vendor-candidates.json:203 |
| help.netflix.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:316, public/rules/policy-sources.json:304, public/rules/return-policy-sources.json:304 |
| help.nytimes.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:597, rules/cancel-policy-confirmed-baseline.json:360, rules/cancel-policy-semantic-state.json:1278 |
| help.openai.com | 23 | 15 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:91, public/rules/cancel-policy-sources.json:94, public/rules/policy-sources.json:87 |
| help.paramountplus.com | 15 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:352, public/rules/policy-sources.json:328, public/rules/return-policy-sources.json:328 |
| help.skillshare.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:128, docs/reviews/policy-candidate-applicability-20260906.md:53, rules/policy-vendor-candidates.json:38 |
| help.snapchat.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:626, rules/cancel-policy-confirmed-baseline.json:493, rules/cancel-policy-semantic-state.json:1367 |
| help.soundcloud.com | 22 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:650, public/rules/policy-sources.json:588, public/rules/policy-sources.json:591 |
| help.starz.com | 2 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:666, rules/cancel-policy-sources.json:666 |
| help.twitch.tv | 5 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:458, rules/cancel-policy-change-candidates.json:182, rules/cancel-policy-change-candidates.json:189 |
| help.typeform.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:86, docs/reviews/policy-candidate-applicability-20260906.md:41, rules/policy-vendor-candidates.json:148 |
| help.vimeo.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:107, docs/reviews/policy-candidate-applicability-20260906.md:47, rules/policy-vendor-candidates.json:102 |
| help.x.com | 12 | 9 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:638, public/rules/policy-sources.json:572, public/rules/return-policy-sources.json:572 |
| helpcenter.washingtonpost.com | 16 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:617, public/rules/policy-sources.json:543, public/rules/policy-sources.json:546 |
| hingeapp.zendesk.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/trial-policy-confirmed-baseline.json:290, rules/trial-policy-semantic-state.json:577 |
| img.shields.io | 4 | 1 | docs_content | T3-content-static | third_party | README.md:5, README.md:6, README.md:7 |
| json-schema.org | 2 | 2 | config_or_data | T3-content-static | third_party | public/schemas/rulebook-migration-v1.schema.json:2, public/schemas/rulebook-v1.schema.json:2 |
| legal.ubi.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:573, public/rules/policy-sources.json:515, public/rules/return-policy-sources.json:515 |
| legal.x.com | 20 | 18 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:630, public/rules/policy-sources.json:564, public/rules/return-policy-sources.json:564 |
| localhost | 4 | 4 | docs_content, other | T3-content-static | third_party | api/compliance-export.js:11, lib/request-query.js:1, scripts/mcp-check.sh:4 |
| mcp.so | 1 | 1 | config_or_data | T3-content-static | third_party | distribution/mcp-directories.json:163 |
| nordvpn.com | 14 | 12 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:331, public/rules/policy-sources.json:319, public/rules/return-policy-sources.json:319 |
| one.google.com | 28 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:205, public/rules/cancel-policy-sources.json:208, public/rules/policy-sources.json:202 |
| openai.com | 13 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:95, public/rules/policy-sources.json:91, public/rules/return-policy-sources.json:91 |
| outside.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-policy-coverage-scorecard.js:133 |
| platform.openai.com | 1 | 1 | config_or_data | T3-content-static | third_party | distribution/mcp-directories.json:175 |
| play.google.com | 2 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:210, rules/trial-policy-sources.json:210 |
| policy-evidence-fixture.invalid | 1 | 1 | other | T3-content-static | third_party | scripts/test-helpers/install-policy-evidence-fixture.js:23 |
| policy.decide.fyi | 34 | 20 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | DISTRIBUTION.md:10, DISTRIBUTION.md:47, DISTRIBUTION.md:132 |
| premium.linkedin.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:270, rules/trial-policy-confirmed-baseline.json:339, rules/trial-policy-coverage-state.json:881 |
| preview.example.com | 1 | 1 | docs_content | T3-content-static | third_party | docs/FIRST_CUSTOMER_RUNBOOK.md:42 |
| production-sfo.browserless.io | 3 | 3 | docs_content, other | T0-critical-runtime | browserless, third_party | README.md:603, api/policy-fetch-hook.js:276, scripts/test-policy-fetch-hook.js:116 |
| proton.me | 36 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:377, public/rules/cancel-policy-sources.json:380, public/rules/cancel-policy-sources.json:381 |
| queued.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:333 |
| r.jina.ai | 2 | 2 | other | T0-critical-runtime | jina_mirror, third_party | api/policy-fetch-hook.js:107, scripts/check-policies.js:3268 |
| raw.githubusercontent.com | 2 | 1 | docs_content | T1-platform-control | github, third_party | client/EXAMPLES.md:89, client/EXAMPLES.md:107 |
| refund.decide.fyi | 20 | 9 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:207, README.md:234, README.md:246 |
| registry.modelcontextprotocol.io | 3 | 2 | config_or_data, other | T3-content-static | third_party | distribution/mcp-directories.json:81, distribution/mcp-directories.json:93, scripts/check-mcp-distribution.js:13 |
| registry.npmjs.org | 2 | 1 | docs_content | T3-content-static | third_party | sdk/README.md:10, sdk/README.md:11 |
| return.decide.fyi | 10 | 5 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:209, README.md:236, README.md:256 |
| ring.com | 36 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:385, public/rules/cancel-policy-sources.json:388, public/rules/cancel-policy-sources.json:389 |
| run-blocked.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:327 |
| secret.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:89 |
| secure.wsj-asia.com | 6 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:613, public/rules/policy-sources.json:539, public/rules/return-policy-sources.json:539 |
| shared.example.test | 1 | 1 | other | T3-content-static | third_party | scripts/test-gemini-usage-budget.js:115 |
| slack.com | 17 | 17 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:405, public/rules/policy-sources.json:376, public/rules/return-policy-sources.json:376 |
| smithery.ai | 4 | 3 | config_or_data, docs_content, other | T3-content-static | third_party | DISTRIBUTION.md:46, distribution/mcp-directories.json:103, distribution/mcp-directories.json:115 |
| soundcloud.com | 6 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:592, public/rules/return-policy-sources.json:592, public/rules/trial-policy-sources.json:575 |
| static.modelcontextprotocol.io | 2 | 2 | config_or_data, other | T3-content-static | third_party | lib/policy-mcp-metadata.js:70, server.json:2 |
| store.playstation.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/trial-policy-confirmed-baseline.json:465, rules/trial-policy-coverage-state.json:1206, rules/trial-policy-semantic-state.json:844 |
| store.ubisoft.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:499, rules/trial-policy-confirmed-baseline.json:633, rules/trial-policy-coverage-state.json:1850 |
| streak.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:336 |
| substack.com | 8 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:555, public/rules/return-policy-sources.json:555, public/rules/trial-policy-sources.json:527 |
| support.1password.com | 21 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:6, public/rules/cancel-policy-sources.json:9, public/rules/policy-sources.json:6 |
| support.amcplus.com | 6 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:679, public/rules/cancel-policy-sources.json:680, rules/cancel-policy-confirmed-baseline.json:38 |
| support.anthropic.com | 12 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:99, public/rules/cancel-policy-sources.json:102, public/rules/policy-sources.json:98 |
| support.apple.com | 68 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:35, public/rules/cancel-policy-sources.json:43, public/rules/cancel-policy-sources.json:47 |
| support.calm.com | 25 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:71, public/rules/cancel-policy-sources.json:74, public/rules/policy-sources.json:71 |
| support.claude.com | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:95, public/rules/return-policy-sources.json:95, rules/policy-confirmed-baseline.json:122 |
| support.dashlane.com | 16 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:495, public/rules/policy-sources.json:457, public/rules/policy-sources.json:460 |
| support.discord.com | 16 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:129, public/rules/cancel-policy-sources.json:132, public/rules/policy-sources.json:125 |
| support.duolingo.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:161, rules/cancel-policy-semantic-state.json:351, rules/cancel-policy-sources.json:161 |
| support.example.com | 3 | 1 | other | T3-content-static | third_party | scripts/test-policy-vendor-candidates.js:105, scripts/test-policy-vendor-candidates.js:110, scripts/test-policy-vendor-candidates.js:146 |
| support.fubo.tv | 23 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:193, public/rules/cancel-policy-sources.json:197, public/rules/policy-sources.json:190 |
| support.google.com | 53 | 18 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:209, public/rules/cancel-policy-sources.json:213, public/rules/cancel-policy-sources.json:483 |
| support.grammarly.com | 24 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:218, public/rules/cancel-policy-sources.json:221, public/rules/policy-sources.json:215 |
| support.lastpass.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:499, rules/cancel-policy-confirmed-baseline.json:304, rules/cancel-policy-sources.json:499 |
| support.microsoft.com | 20 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:300, public/rules/cancel-policy-sources.json:304, public/rules/policy-sources.json:288 |
| support.monday.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:65, docs/reviews/policy-candidate-applicability-20260906.md:35, rules/policy-vendor-candidates.json:258 |
| support.myfitnesspal.com | 19 | 13 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:528, public/rules/cancel-policy-sources.json:537, public/rules/policy-sources.json:477 |
| support.nfl.com | 5 | 5 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:585, rules/cancel-policy-confirmed-baseline.json:367, rules/cancel-policy-semantic-state.json:1316 |
| support.nordvpn.com | 20 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:328, public/rules/cancel-policy-sources.json:332, public/rules/policy-sources.json:316 |
| support.patreon.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:553, rules/cancel-policy-confirmed-baseline.json:402, rules/cancel-policy-coverage-state.json:1700 |
| support.reddithelp.com | 11 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:642, public/rules/policy-sources.json:576, public/rules/return-policy-sources.json:576 |
| support.scribd.com | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:393, public/rules/policy-sources.json:364, public/rules/return-policy-sources.json:364 |
| support.spotify.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:414, rules/cancel-policy-confirmed-baseline.json:507, rules/cancel-policy-semantic-state.json:855 |
| support.squarespace.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:418, public/rules/policy-sources.json:389, public/rules/return-policy-sources.json:389 |
| support.strava.com | 8 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:422, public/rules/policy-sources.json:393, public/rules/return-policy-sources.json:393 |
| support.substack.com | 21 | 17 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:621, public/rules/policy-sources.json:551, public/rules/policy-sources.json:554 |
| support.surfshark.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:426, public/rules/policy-sources.json:397, public/rules/return-policy-sources.json:397 |
| support.thinkific.com | 9 | 3 | config_or_data, docs_content | T3-content-static | third_party | docs/reviews/policy-candidate-applicability-20260906.json:149, docs/reviews/policy-candidate-applicability-20260906.md:59, rules/policy-vendor-candidates.json:313 |
| support.tidal.com | 22 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:430, public/rules/cancel-policy-sources.json:434, public/rules/policy-sources.json:401 |
| support.wix.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:475, public/rules/policy-sources.json:437, public/rules/return-policy-sources.json:437 |
| support.xbox.com | 15 | 13 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:479, public/rules/policy-sources.json:441, public/rules/return-policy-sources.json:441 |
| support.zoom.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:685, public/rules/policy-sources.json:618, public/rules/return-policy-sources.json:618 |
| surfshark.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:399, rules/trial-policy-confirmed-baseline.json:584, rules/trial-policy-coverage-state.json:1396 |
| telegram.org | 23 | 19 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:646, public/rules/policy-sources.json:584, public/rules/return-policy-sources.json:584 |
| tidal.com | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:433, public/rules/policy-sources.json:405, public/rules/return-policy-sources.json:404 |
| tinder.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:411, rules/trial-policy-confirmed-baseline.json:605, rules/trial-policy-coverage-state.json:1418 |
| todoist.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:419, rules/trial-policy-confirmed-baseline.json:612, rules/trial-policy-coverage-state.json:1440 |
| trial.decide.fyi | 10 | 5 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:210, README.md:237, README.md:261 |
| tv.youtube.com | 22 | 20 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:487, public/rules/policy-sources.json:449, public/rules/return-policy-sources.json:449 |
| vendor.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-policy-vendor-lifecycle.js:94 |
| wrong.example | 1 | 1 | other | T3-content-static | third_party | scripts/test-policy-evidence-snapshot.js:49 |
| www.adobe.com | 24 | 20 | config_or_data, data_source | T3-content-static | third_party | public/replay/rulebook-v1/cancel-policy-notary-penalty.json:221, public/replay/rulebook-v1/cancel-policy-notary-penalty.json:427, public/replay/rulebook-v1/refund-policy-notary-allow.json:211 |
| www.amazon.com | 111 | 21 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:18, public/rules/cancel-policy-sources.json:21, public/rules/cancel-policy-sources.json:22 |
| www.amcplus.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:676, public/rules/policy-sources.json:614, public/rules/return-policy-sources.json:614 |
| www.anthropic.com | 8 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:103, public/rules/policy-sources.json:99, public/rules/return-policy-sources.json:99 |
| www.apache.org | 2 | 1 | other | T3-content-static | third_party | sdk/LICENSE:3, sdk/LICENSE:195 |
| www.apple.com | 31 | 18 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:39, public/rules/cancel-policy-sources.json:42, public/rules/policy-sources.json:42 |
| www.audible.com | 21 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:58, public/rules/policy-sources.json:55, public/rules/policy-sources.json:58 |
| www.britbox.com | 16 | 16 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:672, public/rules/policy-sources.json:610, public/rules/return-policy-sources.json:610 |
| www.calm.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:75, public/rules/policy-sources.json:75, public/rules/return-policy-sources.json:75 |
| www.canva.com | 34 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:79, public/rules/cancel-policy-sources.json:86, public/rules/cancel-policy-sources.json:87 |
| www.coursera.org | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:103, rules/trial-policy-confirmed-baseline.json:129, rules/trial-policy-semantic-state.json:271 |
| www.coursera.support | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:107, public/rules/policy-sources.json:103, public/rules/return-policy-sources.json:103 |
| www.crunchyroll.com | 6 | 6 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:107, rules/policy-events.ndjson:21, rules/trial-policy-confirmed-baseline.json:136 |
| www.dashlane.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:461, public/rules/return-policy-sources.json:461, public/rules/trial-policy-sources.json:459 |
| www.decide.fyi | 35 | 21 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | DISTRIBUTION.md:16, README.md:18, README.md:617 |
| www.deezer.com | 17 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:125, public/rules/policy-sources.json:121, public/rules/return-policy-sources.json:121 |
| www.discoveryplus.com | 16 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:658, public/rules/cancel-policy-sources.json:659, public/rules/policy-sources.json:597 |
| www.disneyplus.com | 25 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:145, public/rules/cancel-policy-sources.json:169, public/rules/policy-sources.json:133 |
| www.doordash.com | 4 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:140, public/rules/trial-policy-sources.json:141, rules/trial-policy-sources.json:140 |
| www.dropbox.com | 29 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:156, public/rules/cancel-policy-sources.json:157, public/rules/policy-sources.json:150 |
| www.duolingo.com | 15 | 14 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/policy-sources.json:158, public/rules/return-policy-sources.json:158, public/rules/trial-policy-sources.json:153 |
| www.ea.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:511, public/rules/return-policy-sources.json:511, public/rules/trial-policy-sources.json:495 |
| www.espn.com | 28 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:165, public/rules/cancel-policy-sources.json:168, public/rules/policy-sources.json:162 |
| www.example.com | 2 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:944, scripts/test-check-policies.js:956 |
| www.expressvpn.com | 33 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:181, public/rules/cancel-policy-sources.json:184, public/rules/cancel-policy-sources.json:185 |
| www.figma.com | 17 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:189, public/rules/policy-sources.json:186, public/rules/return-policy-sources.json:186 |
| www.fitbit.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:524, public/rules/policy-sources.json:473, public/rules/return-policy-sources.json:473 |
| www.fubo.tv | 12 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:196, public/rules/policy-sources.json:193, public/rules/return-policy-sources.json:193 |
| www.grammarly.com | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:222, public/rules/policy-sources.json:219, public/rules/return-policy-sources.json:219 |
| www.headspace.com | 12 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:230, public/rules/policy-sources.json:227, public/rules/return-policy-sources.json:227 |
| www.hellofresh.com | 26 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:234, public/rules/cancel-policy-sources.json:237, public/rules/cancel-policy-sources.json:238 |
| www.help.tinder.com | 33 | 17 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:438, public/rules/cancel-policy-sources.json:441, public/rules/cancel-policy-sources.json:442 |
| www.hulu.com | 19 | 19 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:258, public/rules/policy-sources.json:247, public/rules/return-policy-sources.json:247 |
| www.instacart.com | 32 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:266, public/rules/cancel-policy-sources.json:269, public/rules/cancel-policy-sources.json:270 |
| www.keepersecurity.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:511, public/rules/policy-sources.json:469, public/rules/return-policy-sources.json:469 |
| www.krafthaus.app | 14 | 5 | config_or_data, docs_content, other | T3-content-static | third_party | decide-policy-notaries/README.md:31, distribution/mcp-directories.json:60, distribution/mcp-directories.json:62 |
| www.lastpass.com | 19 | 18 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:507, public/rules/policy-sources.json:465, public/rules/return-policy-sources.json:465 |
| www.linkedin.com | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:282, public/rules/policy-sources.json:271, public/rules/return-policy-sources.json:271 |
| www.masterclass.com | 38 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:286, public/rules/cancel-policy-sources.json:289, public/rules/cancel-policy-sources.json:290 |
| www.max.com | 6 | 6 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:283, rules/policy-events.ndjson:23, rules/trial-policy-confirmed-baseline.json:353 |
| www.microsoft.com | 13 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:303, public/rules/policy-sources.json:291, public/rules/return-policy-sources.json:291 |
| www.midjourney.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:295, rules/trial-policy-confirmed-baseline.json:367, rules/trial-policy-coverage-state.json:1000 |
| www.mlb.com | 32 | 19 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:589, public/rules/cancel-policy-sources.json:592, public/rules/cancel-policy-sources.json:593 |
| www.myfitnesspal.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:487, public/rules/return-policy-sources.json:487, public/rules/trial-policy-sources.json:475 |
| www.netflix.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:303, rules/trial-policy-confirmed-baseline.json:388, rules/trial-policy-coverage-state.json:977 |
| www.nfl.com | 16 | 16 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:577, public/rules/policy-sources.json:519, public/rules/return-policy-sources.json:519 |
| www.nintendo.com | 13 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:308, public/rules/return-policy-sources.json:308, public/rules/trial-policy-sources.json:307 |
| www.noom.com | 16 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:324, public/rules/policy-sources.json:312, public/rules/return-policy-sources.json:312 |
| www.notion.com | 12 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:336, public/rules/cancel-policy-sources.json:339, public/rules/cancel-policy-sources.json:340 |
| www.notion.so | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:323, rules/policy-confirmed-baseline.json:423, rules/policy-semantic-state.json:754 |
| www.npmjs.com | 2 | 2 | docs_content | T3-content-static | third_party | README.md:183, sdk/README.md:9 |
| www.nytimes.com | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:605, public/rules/policy-sources.json:531, public/rules/return-policy-sources.json:531 |
| www.onepeloton.com | 20 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:365, public/rules/cancel-policy-sources.json:368, public/rules/cancel-policy-sources.json:369 |
| www.paramountplus.com | 9 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:344, public/rules/cancel-policy-sources.json:353, public/rules/trial-policy-sources.json:327 |
| www.patreon.com | 15 | 14 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/policy-sources.json:503, public/rules/return-policy-sources.json:503, public/rules/trial-policy-sources.json:487 |
| www.peacocktv.com | 34 | 18 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:357, public/rules/cancel-policy-sources.json:360, public/rules/cancel-policy-sources.json:361 |
| www.playstation.com | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:373, public/rules/policy-sources.json:344, public/rules/return-policy-sources.json:344 |
| www.pulsemcp.com | 1 | 1 | config_or_data | T3-content-static | third_party | distribution/mcp-directories.json:151 |
| www.reddit.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:579, public/rules/return-policy-sources.json:579, public/rules/trial-policy-sources.json:552 |
| www.redditinc.com | 6 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:580, public/rules/return-policy-sources.json:580, public/rules/trial-policy-sources.json:553 |
| www.roblox.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:491, rules/trial-policy-confirmed-baseline.json:493, rules/trial-policy-coverage-state.json:1828 |
| www.scribd.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:363, rules/trial-policy-confirmed-baseline.json:500, rules/trial-policy-coverage-state.json:1229 |
| www.shutterstock.com | 34 | 18 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:397, public/rules/cancel-policy-sources.json:400, public/rules/cancel-policy-sources.json:401 |
| www.siriusxm.com | 31 | 19 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:545, public/rules/cancel-policy-sources.json:548, public/rules/cancel-policy-sources.json:549 |
| www.sling.com | 18 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:409, public/rules/policy-sources.json:380, public/rules/return-policy-sources.json:380 |
| www.smithery.ai | 1 | 1 | other | T3-content-static | third_party | lib/mcp-handler.js:16 |
| www.snap.com | 8 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:560, public/rules/return-policy-sources.json:560, rules/policy-confirmed-baseline.json:528 |
| www.snapchat.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:532, rules/trial-policy-confirmed-baseline.json:535, rules/trial-policy-semantic-state.json:1498 |
| www.spotify.com | 13 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:385, public/rules/return-policy-sources.json:385, public/rules/trial-policy-sources.json:387 |
| www.squarespace.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:391, rules/trial-policy-confirmed-baseline.json:556, rules/trial-policy-semantic-state.json:984 |
| www.starz.com | 30 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:663, public/rules/cancel-policy-sources.json:667, public/rules/policy-sources.json:601 |
| www.strava.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:395, rules/policy-confirmed-baseline.json:563, rules/policy-semantic-state.json:952 |
| www.todoist.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:446, public/rules/policy-sources.json:417, public/rules/return-policy-sources.json:417 |
| www.twitch.tv | 17 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:450, public/rules/cancel-policy-sources.json:459, public/rules/policy-sources.json:421 |
| www.uber.com | 32 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:463, public/rules/cancel-policy-sources.json:466, public/rules/cancel-policy-sources.json:467 |
| www.ubisoft.com | 5 | 5 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:565, rules/cancel-policy-confirmed-baseline.json:584, rules/cancel-policy-semantic-state.json:1244 |
| www.w3.org | 1 | 1 | frontend | T3-content-static | third_party | public/index.html:9 |
| www.walmart.com | 16 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:471, public/rules/policy-sources.json:433, public/rules/return-policy-sources.json:433 |
| www.washingtonpost.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:547, public/rules/return-policy-sources.json:547, public/rules/trial-policy-sources.json:519 |
| www.weightwatchers.com | 22 | 21 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:541, public/rules/policy-sources.json:491, public/rules/return-policy-sources.json:491 |
| www.wix.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:439, rules/trial-policy-confirmed-baseline.json:668, rules/trial-policy-coverage-state.json:1567 |
| www.wsj.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:515, rules/trial-policy-confirmed-baseline.json:640, rules/trial-policy-coverage-state.json:1958 |
| www.xbox.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:443, rules/trial-policy-confirmed-baseline.json:682, rules/trial-policy-coverage-state.json:1544 |
| www.youtube.com | 14 | 12 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:490, public/rules/policy-sources.json:452, public/rules/return-policy-sources.json:452 |
| x.com | 4 | 3 | config_or_data, data_source, docs_content | T3-content-static | third_party | README.md:612, README.md:622, public/rules/trial-policy-sources.json:544 |
| zoom.us | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:600, rules/trial-policy-confirmed-baseline.json:703, rules/trial-policy-coverage-state.json:2209 |

## 4) Generation Method

```bash
./scripts/generate-project-inventory.sh
```

- URLs are host-normalized (`URL.hostname`) with cleanup for comma-separated URL strings.
- Risk tiers are rule-based and prioritized from runtime-critical to content/static.
- Parse failures are listed in `OUTBOUND_URL_PARSE_ISSUES.md`.
