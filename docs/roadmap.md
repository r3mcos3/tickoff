# Roadmap: from "works for the maintainer" to a public beta

Status: v0.4.x, used only by its maintainer. Everything is covered by automated tests, but those run against a simulated
Home Assistant, frontend, Telegram and HACS. This is the path before inviting other people. The tracking issues are in the
[Public beta milestone](https://github.com/r3mcos3/tickoff/milestone/1).

## Why not public yet

- **No real-world use yet.** The first bug found after release (double installs with HACS) was one tests did not catch.
- **Home Assistant 2026.11 is required but not tested** (the test library has no release for it yet).
- **Self-update is unusual and risky** for an integration (no checksum for source archives; people expect HACS or the Marketplace to update).
- **Support load.** One maintainer, a Home Assistant that changes monthly, and three established alternatives (Home Tasks,
  Better ToDo, Chore Calendar). Tickoff's value is the combination: one collection of tasks, quick add in English/Dutch,
  Telegram notifications, a sidebar panel and a clean card.

## Steps

| # | Step | Issue | Needs |
|---|---|---|---|
| 1 | Use it daily for 2-4 weeks on a real Home Assistant, work through `docs/testen.md` | [#6](https://github.com/r3mcos3/tickoff/issues/6) | maintainer |
| 2 | Verify Telegram with a real bot | [#8](https://github.com/r3mcos3/tickoff/issues/8) | maintainer |
| 3 | Run on Home Assistant 2026.11 (tests when the library allows, a real instance meanwhile) | [#7](https://github.com/r3mcos3/tickoff/issues/7) | blocked on the test library |
| 4 | Make self-update optional, informational by default | [#9](https://github.com/r3mcos3/tickoff/issues/9) | code |
| 5 | Review mobile/touch behaviour | [#10](https://github.com/r3mcos3/tickoff/issues/10) | maintainer + code |
| 6 | Repository hygiene (templates, SECURITY, screenshots, changelog) | [#11](https://github.com/r3mcos3/tickoff/issues/11) | docs |
| 7 | Soft launch: HACS custom repository + one forum post, clearly marked as beta | [#12](https://github.com/r3mcos3/tickoff/issues/12) | maintainer |
| 8 | After a stable period: HACS default list, Marketplace listing check | [#13](https://github.com/r3mcos3/tickoff/issues/13) | later |

Order: 1 and 2 start now and run in parallel with 4, 5 and 6. Step 7 only after 1-5 are done; step 8 only after a few
months without serious bugs.

## Done when (public beta)

- Two weeks of daily use without data loss, missed or duplicate notifications, or update problems.
- Verified on Home Assistant 2026.11 and on a phone.
- Self-update is not the default path for HACS users.
- A newcomer can find what Tickoff is, how to install it and how to report a problem.
