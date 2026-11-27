# Phase 9 — implementation audit

Phase 8 baseline: 243 unit tests, 23 Chrome flows, two real online Edge flows. Phase 9 starts from commit `8c39969` on its own branch. Phase 8 remains a draft PR. No deployment or DNS changes.

## Actual systems

The repository implements the 30-stage campaign, training, structural/city/vertical/disaster laboratories, survival, free building, a six-city world simulation, and authoritative two-player duel/co-op with spectators. Online ranked accounts, seasons, replay and specialized competitive modes remain unimplemented. They will not be represented by simulated opponents or invented rankings.

## Prioritized findings

| Severity | Evidence                                                                                    | Work                                                                             |
| -------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| High     | Runtime uses operating-system keyboard repeat; background/modal input is incompletely gated | Deterministic repeat and focus/modal cancellation                                |
| High     | Manual recycle advances immediately and legacy non-city play grants materials each time     | Shared cooldown; persisted single-player boundary and server-owned hand boundary |
| High     | Timer expiry places any legal piece, even critical-risk placements                          | Only automatically place a safe candidate                                        |
| Medium   | Rotation at an edge does not try a nearby legal origin                                      | Optional one-cell rotation correction, pure rules, no cross-floor teleport       |
| Medium   | No local smart snap or predicted construction deltas                                        | Opt-in intent-preserving snap and concise actual projection                      |
| Medium   | No photo mode; keyboard/ghost obstruct city inspection                                      | Pause single player, retain online clock, clean scene and capture                |
| Medium   | Co-op victory screenshot retains a rejected-collision error                                 | Clear transient action errors on final authoritative result                      |
| Medium   | Duel ranking sorts objectives before total but UI omits that rule                           | Explain actual comparator and objective count                                    |
| Medium   | Online confirmation lacks focus containment/Escape                                          | Reuse accessible shared dialog                                                   |
| Medium   | Camera target clamps to ±5 despite build extent −8…7                                        | Match camera target extent to actual build limits                                |
| Low      | Existing city advisor already caps three warnings but power follows food                    | Prioritize essential power, preserve serious warnings                            |

Existing capabilities to preserve: stationary-pointer/raycast handling, drag protection, four risk colors, ghost cell footprint, deterministic seeded queue, hold deadline, economy orders, bounded advisor, structural analysis, mission checkpoints/results, survival forecast/rewards, world overview/trade, online input deduplication and reconnect. Gameplay polish should extend these rather than duplicate their simulations.

## Verification method

Run the existing five basic browser flows before changing source. Add targeted pure-rule and browser tests for repeat, snap/rotation, recycle exploit, safe timer expiry, old settings/save defaults, photo pause, modal isolation and online result behavior. Measure input-to-next-hand in browser without artificial animation delay; do not claim human enjoyment or hardware GPU performance from automated tests.
