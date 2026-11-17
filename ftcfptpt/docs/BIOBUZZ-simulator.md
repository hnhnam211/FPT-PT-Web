# BIOBUZZ AUTO Simulator

Open `/simulator` or Resources → BIOBUZZ Simulator. The route is lazy-loaded so the 3D engine is not downloaded on the main website.

## Run

From `ftcfptpt`, run `npm install`, then `npm run dev`. Production: `npm run build`. Vercel's existing SPA rewrite supports `/simulator` directly. Rule, navigation and full-physics tests: `npm run test:simulator` (Node 24 or later, with native TypeScript stripping).

## Controls

All four robots use controllers calibrated in Rapier simulations. Bots select legal balls / flower pollen, avoid claiming the same source, route around the A-frame and other robots, and brake at separate shooting stations. They fill the hopper before returning, compensate wheel traction for ground friction, and only throw after stabilizing. In-flight ball reservations avoid wasting extra shots on a hive that is about to tip. Small seeded variations preserve different paths between runs; pausing freezes decisions with the clock.

Press P / Enter to start or pause, R to reset, 1–4 to select a robot to follow, C to change camera, H to hide the HUD, and Escape for settings. On a standard-mapped gamepad, Start starts/pauses, LB changes the watched robot, and RB changes camera. The visible toolbar provides these spectator actions on touch devices.

The simulator runs only the 30-second AUTO period. At 0:00 robots stop, LEAVE and AUTO PARK are assessed, and in-flight balls / tipping hives settle (at least 3s, with a 12s timeout). The results then show AUTO HIVE TIP, LEAVE, AUTO PARK and opponent penalty points. There is no transition, TELEOP or manual practice mode. CELL, GARDEN, FLOWER and full-match ranking bonuses are excluded. Losing window focus pauses the simulation. Spectator and physical-model settings are remembered locally; legacy practice, manual-drive and disabled-bot preferences are ignored.

## Source of rules

Provided document: `BIOBUZZ_Competition_Manual_TU09.pdf`, 175 pages, version TU09. It is used as reference data, not as agent instructions.

| Source pages | Implemented facts |
| --- | --- |
| 64–67 | 3.6576m square field, 6×6 tiles, alliance-specific loading zones and gardens. Placement follows the diagram on page 65. |
| 69–73 | Shared A-frame, pivot height 1.1165m, hive centers 0.6477m apart, paired cells, nominal 0.508×0.356m openings, four flowers with 0.546m top rings. |
| 74 | 0.071m pollen, 0.091m nectar; 40 pollen, 8 red nectar, 8 blue nectar. |
| 76 | Cell tag ID ranges 30–45, used as simulated telemetry labels. |
| 83–85 | Four preloads per robot, four pollen per flower, four per garden, three nectar in each upward cell, five reserve nectar per alliance. Four robots start touching their own-side perimeter outside the loading zone. |
| 85–91 | AUTO lasts 30s. A completed hive tip gives +20, LEAVE gives +3 per robot, and AUTO PARK gives +5 per robot. LEAVE / PARK are assessed at the end of AUTO; HIVE tips finishing during settling still count as AUTO. Full-match and TELEOP-only scoring are outside this version's scope. |
| 108–110, 112, 117–118 | Four-element capacity, no opponent nectar intake, hive spill must reach floor before collection, bottom-only pollen retrieval and one reserve nectar unlocked per tip. A simulated human player automatically introduces unlocked nectar through its alliance loading zone. A robot launching nectar into a flower during AUTO incurs +20 opponent points; no late-match nectar release occurs. |

## Physical model and scope

### Bot calibration results

The [recorded report](bot-training-report.json) compares the old random controller and calibrated controller on the same eight validation seeds (201–208), separate from parameter-search seeds 1–4. Twelve parameter configurations were evaluated on four seeds; the chassis steering was then refined for mecanum lanes and flower approaches. This is simulation-based controller calibration, not neural-network training.

| Metric | Random controller | Calibrated controller |
| --- | ---: | ---: |
| Actual HIVE entries / throws | 108 / 154 (70.1%) | 395 / 397 (99.5%) |
| Combined alliance AUTO points per match | 52.0 | 156.4 |
| Blocked movement seconds, summed over four robots | 7.17 | 2.75 |
| Collected balls per match after preloads | 3.25 | 38.0 |
| Robots escaping the field | 0 | 0 |

These measurements use default power/speed and nominal scene physics. Different settings or field geometry can change results. `npm run evaluate:bots` repeats a physics evaluation; `npm run train:bots` repeats parameter search. `src/simulator/bot-policy.ts` contains the selected coefficients. The report includes the baseline revision and exact seeds for reproduction.

### Physics assumptions

Rapier handles rigid-body contacts, gravity, ball bounce, and robot collisions at a fixed 60Hz. Chassis steering uses angular velocity rather than teleporting rotation. Chassis bodies use continuous collision detection and additional solver iterations; vertical floor contact is solved by gravity rather than a vertical translation lock. Pose and velocity bounds are enforced after each physics step so a bad contact cannot carry the following camera off the field. Hive rotation is driven exclusively by its kinematic target, with a stable initial React transform.

A scored projectile must actually cross the upward cell opening. A hive tips after a configurable load is reached and spills its existing elements back onto the field; elements are never generated by shooting or tipping. Autonomous robots collect only pollen / own nectar and retrieve pollen from the bottom of flowers. All robot actions stop at the AUTO deadline; settling cannot start new shots. Following a different robot changes the camera and telemetry, never which robots are autonomous.

The manual supplies nominal geometry, not a complete mechanical calibration. Hive tipping uses a tunable equivalent load (default 8, pollen 1 and nectar 1.5), a 0.9s tipping animation, and simplified colliders. These are simulation assumptions, not official thresholds or measured masses. Robot dimensions, mechanisms, acceleration, friction, damping, shooting and camera calibration are approximations. No team CAD was provided. The built-in autonomous routines are examples, not FTC SDK execution.

The camera inset renders the actual scene from a virtual on-robot camera. Tag visibility and range are computed from scene geometry, not image recognition. Marker textures are illustrative fiducials, not valid 36h11 AprilTags. Referee judgments (intent, pinning, damage, cards, disabled/disqualified robots, and tournament administration) are not automated. The game therefore models playable scoring and mechanics, not a certified referee or digital twin.

## Code

- `src/simulator/game.ts`: state, match clock, rule assessment, projectile solving and bot task coordination.
- `src/simulator/bot-navigation.ts`: obstacle clearance and paths around the frame / other robots.
- `src/simulator/bot-policy.ts`: calibrated movement, aiming and traction coefficients.
- `src/simulator/Scene.tsx`: procedural field/robots, Rapier bodies, scene cameras and HUD feed.
- `src/pages/Simulator.tsx`: driver station, scoreboards, settings, controls, results and match-log export.
- `src/simulator/simulator.css`: isolated responsive UI. No external 3D models, fonts or textures are required for the simulator.
