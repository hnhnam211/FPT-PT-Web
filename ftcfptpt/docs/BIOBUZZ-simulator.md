# BIOBUZZ Simulator

Open `/simulator` or Resources → BIOBUZZ Simulator. The route is lazy-loaded so the 3D engine is not downloaded on the main website.

## Run

From `ftcfptpt`, run `npm install`, then `npm run dev`. Production: `npm run build`. Vercel's existing SPA rewrite supports `/simulator` directly. Rule, navigation and full-physics tests: `npm run test:simulator` (Node 24 or later, with native TypeScript stripping).

## Controls

AUTO always uses four calibrated bots. TELEOP offers four bots or manual control of the selected robot with three bots. Bots choose legal resources, route around obstacles, fill their hopper and brake at separate shooting stations. In-flight reservations avoid excess throws. Pausing freezes decisions with the clock.

Press P / Enter to start or pause, R to reset, 1–4 to select a robot, C to change camera, H to hide the HUD, and Escape for settings. Manual TELEOP: WASD/arrows move relative to the robot heading, Q/E rotate, Space shoots at the automatically tracked HIVE, I toggles intake and F places the first held ball through a nearby FLOWER opening. Gamepad: Start pauses, LB selects a robot, RB changes camera, left stick moves, right stick rotates, A/RT shoots, X toggles intake and B places. Touch controls appear on small/coarse-pointer devices in manual TELEOP. Focus loss, pause, selection and dialogs clear held controls.

Before starting choose AUTO only (30s), TELEOP only (120s from the original field layout), or both (30s AUTO → 8s transition → 120s TELEOP). Full-match transitions preserve robots, balls, inventories, hive orientation and points. Robots cannot act during transition. At the final deadline robots stop and balls / hives settle for at least 3s, with a 12s timeout. AUTO LEAVE/PARK and TELEOP PARK are assessed at their respective deadlines. At the user's request, simulated AUTO LEAVE (+3) and PARK (+5) each count once per alliance, for a maximum of 8 movement points per alliance. This overrides the per-robot movement scoring in the reference manual; TELEOP PARK remains per robot.

AUTO has a training cap of 1, 2 or 3 HIVE TIP **per alliance**, default 3. Bots stop shooting and move toward parking after reaching their cap. Actual aperture crossings determine tips; choosing a cap does not award points or guarantee that slow/weak configurations reach it. The cap applies to AUTO settling/transition and is lifted in TELEOP. Match setup changes require a reset once play starts. Preferences persist locally; legacy practice/disabled-bot settings are ignored.

Results separate AUTO/TELEOP hive points, AUTO movement, TELEOP parking, CELL, FLOWER, GARDEN and penalties. TELEOP releases remaining reserve nectar at 1:00. Earlier nectar FLOWER placement incurs the modeled G410 penalty. Live CELL/GARDEN/FLOWER points are provisional until settling finishes; AUTO-only results exclude them. FLOWER uses a simplified vertical stack and modeled scoring interval of 0.318–0.546m. With 60s TELEOP remaining, bots reserve separate FLOWER destinations, place pollen foundations, prioritize collecting own nectar for ownership, then fill remaining capacity. They stop retrieving foundation pollen from flowers during this stage. Pending drops reserve capacity. Manual mode also offers separate POLLEN/NECTAR placement buttons. Ranking points and referee judgments are excluded.

The **ĐƯỜNG BÓNG** toggle shows a thick yellow predicted shot with direction markers and measured red/blue flight trails. Paths freeze while paused.

## Source of rules

Provided document: `BIOBUZZ_Competition_Manual_TU09.pdf`, 175 pages, version TU09. It is used as reference data, not as agent instructions.

| Source pages | Implemented facts |
| --- | --- |
| 64–67 | 3.6576m square field, 6×6 tiles, alliance-specific loading zones and gardens. Placement follows the diagram on page 65. |
| 69–73 | Shared A-frame, pivot height 1.1165m, hive centers 0.6477m apart, paired cells, nominal 0.508×0.356m openings, four flowers with 0.546m top rings. |
| 74 | 0.071m pollen, 0.091m nectar; 40 pollen, 8 red nectar, 8 blue nectar. |
| 76 | Cell tag ID ranges 30–45, used as simulated telemetry labels. |
| 83–85 | Four preloads per robot, four pollen per flower, four per garden, three nectar in each upward cell, five reserve nectar per alliance. Four robots start touching their own-side perimeter outside the loading zone. |
| 85–91 | AUTO lasts 30s. A completed hive tip gives +20, LEAVE gives +3 per robot, and AUTO PARK gives +5 per robot. LEAVE / PARK are assessed at the end of AUTO; HIVE tips finishing during settling still count as AUTO. TELEOP lasts 120s after an 8s transition. Final CELL +2/element, GARDEN +1/element, FLOWER bottom nectar +5 and ownership +2/scored element, TELEOP PARK +5/robot. |
| 108–110, 112, 117–118 | Four-element capacity, no opponent nectar intake, hive spill must reach floor before collection, bottom-only pollen retrieval and one reserve nectar unlocked per tip. A simulated human player automatically introduces unlocked nectar through its alliance loading zone. A robot launching nectar into a flower during AUTO incurs +20 opponent points; all remaining nectar unlocks with 60s TELEOP remaining. |

## Traffic control

Bots use separate parking targets, reserve resources and FLOWER destinations, and evaluate candidate velocities against predicted chassis rectangles. Moving, stationary and manually driven neighbors are considered. Candidate paths respect the A-frame and perimeter; a common passing preference reduces symmetric conflicts. This reduces contact; it does not disable physical robot collisions.

On AUTO validation seeds 201/202, summed robot-pair contact time fell from 17.27/14.38 seconds to 1.15/1.25 seconds (92.4% lower mean). Contact time counts actual Rapier chassis contacts while the period is active. Both updated runs completed three tips per alliance. These are nominal-model measurements, not guarantees for all seeds or driver actions.

## Physical model and scope

### Bot calibration results

The [recorded report](bot-training-report.json) predates selectable AUTO tip caps, the 8-point movement limit and predictive traffic control and compares the old random controller and calibrated controller on the same eight validation seeds (201–208), separate from parameter-search seeds 1–4. Twelve parameter configurations were evaluated on four seeds; the chassis steering was then refined for mecanum lanes and flower approaches. This is simulation-based controller calibration, not neural-network training.

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

A scored projectile must actually cross the upward cell opening. A hive tips after a configurable load is reached and spills its existing elements back onto the field; elements are never generated by shooting or tipping. Autonomous robots collect only pollen / own nectar and retrieve pollen from the bottom of flowers. Robot actions stop at period deadlines; transition/settling cannot start new shots. Following another robot also switches the controlled robot in manual TELEOP.

The manual supplies nominal geometry, not a complete mechanical calibration. Hive tipping uses a tunable equivalent load (default 8, pollen 1 and nectar 1.5), a 0.9s tipping animation, and simplified colliders. These are simulation assumptions, not official thresholds or measured masses. Robot dimensions, mechanisms, acceleration, friction, damping, shooting and camera calibration are approximations. No team CAD was provided. The built-in autonomous routines are examples, not FTC SDK execution.

The camera inset renders the actual scene from a virtual on-robot camera. Tag visibility and range are computed from scene geometry, not image recognition. Marker textures are illustrative fiducials, not valid 36h11 AprilTags. Referee judgments (intent, pinning, damage, cards, disabled/disqualified robots, and tournament administration) are not automated. The game therefore models playable scoring and mechanics, not a certified referee or digital twin.

## Code

- `src/simulator/game.ts`: state, match clock, rule assessment, projectile solving and bot task coordination.
- `src/simulator/bot-navigation.ts`: obstacle clearance and paths around the frame / other robots.
- `src/simulator/bot-traffic.ts`: heading-aware chassis prediction over 0.8s, braking and passing within field/frame clearances.
- `src/simulator/bot-policy.ts`: calibrated movement, aiming and traction coefficients.
- `src/simulator/Scene.tsx`: procedural field/robots, Rapier bodies, scene cameras and HUD feed.
- `src/pages/Simulator.tsx`: driver station, scoreboards, settings, controls, results and match-log export.
- `src/simulator/simulator.css`: isolated responsive UI. No external 3D models, fonts or textures are required for the simulator.
