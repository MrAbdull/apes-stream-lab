# EarthLab Campus: technical plan

A Labster-style virtual science platform for **Earth, Environmental, Biological and Ecological science only**.
Physics and chemistry appear only where they explain an environmental or biological process.

## 1. What the four repositories actually are (verified 2026-11-01)

| | Maroon | ScienceLab 3D | VossLab protocol sim | HandsOn |
|---|---|---|---|---|
| Repo | GameLabGraz/Maroon | rudra496/sciencelab3d | vosslab/virtual-lab-protocol-simulation | project-slot/HandsOn |
| Engine | Unity (C#), 3.8 GB repo | Next.js 16 + React 19 + React Three Fiber (three 0.184) | TypeScript + Solid.js runtime, Python/Node build pipeline, **2D SVG** scenes | Unity (C#), Android ARCore |
| License | **None** (no LICENSE file = all rights reserved) | MIT | Code **LGPL-3.0**, content **CC-BY-4.0** | MIT |
| Subjects | Physics, chemistry, computer science | ~40 demos: physics, chemistry, math, biology (ecosystem, natural selection, photosynthesis, cells…) | Cell-culture and SDS-PAGE wet-lab protocols | Physics (buoyancy) |
| Activity | Active (2026) | Active (2026) | Active (2026) | Last change Dec 2023 |
| Browser | Unity WebGL build (large, weak on iPad Safari) | Yes | Yes | No (Android AR app) |
| Standout feature | Hub lab: walk to a station, teleport into an experiment room | Slider-driven sims with live data panels | **Data-authored protocols**: steps → target, gesture, instruction, hint, validator, feedback, scene operations; restorable step machine; schema-versioned saves | Natural-language AI assistant ("spawn…", "set…", "why…") |
| Weaknesses | Can't legally reuse; off-topic subjects; Unity | Toy sims: `Math.random()` without seeds, frame-rate-dependent motion, sphere graphics, no assessment or missions | 2D only; heavy multi-language build | Paid Azure dependency; **hard-coded API keys were leaked** (README); off-topic; stale |

## 2. Compatibility findings

- **Unity and browser code can't be merged.** Maroon and HandsOn are Unity C# projects. Their scripts can't run in our JavaScript platform,
  and Unity WebGL builds (20–100 MB, Unity Editor required) conflict with the iPad/laptop, no-install, no-server goals.
- **Maroon cannot be reused at all:** it has no license, so only its *idea* (hub, stations, rooms) can inform the design.
- **ScienceLab 3D** needs a React/Next.js build. Its ecology code would need rewriting anyway (unseeded randomness, frame-rate bugs),
  so we take its experiment ideas, not its code.
- **VossLab** code is LGPL and its pipeline needs Python and Node. We re-implement its *architecture* (data-authored steps,
  validators, feedback, checkpointed step machine) in our own code and credit the design. No LGPL code is copied.
- **HandsOn's** cloud AI conflicts with the no-server, no-cost, student-privacy goals. We keep the *idea* as an offline assistant.

## 3. Decisions: reuse, adapt or rebuild

| Capability | Source of the idea | Decision |
|---|---|---|
| Central campus hub with portals to subject worlds | Maroon (concept) | **Rebuild** in three.js with CC0 art |
| Data-authored missions (steps, targets, gestures, validators, hints, feedback, objectives) | VossLab (architecture) | **Re-implement** as JSON *mission files* loaded at runtime, with no build step |
| Checkpointed progress with schema version and content fingerprint | VossLab | **Re-implement** in the progress store |
| Live simulations with sliders and data panels; trophic-level ecosystem, natural selection, photosynthesis | ScienceLab 3D (ideas, MIT) | **Rebuild** as seeded, frame-rate-independent models inside world modules |
| Lab assistant you can talk to | HandsOn (concept) | **Rebuild offline**: NPC teachers with dialogue plus a local "Ask" box matching questions to each world's glossary. No keys, no cloud |
| 3D character, walking, camera, LOD, sky, water | Our Stream Lab | **Promote** into the shared engine |
| Stream Health Lab (data, ID, tests, report, teacher keys, groups) | Our Stream Lab | **Keep working unchanged** and launch it from the campus; migrate it onto the engine later |

Better open-source choices made instead of the repos' stacks:
- **three.js (MIT), no build step**: runs from plain files on GitHub Pages, and teachers can add worlds by dropping in folders.
- **CC0 art** (flo-bit, Quaternius, KayKit) instead of Unity assets.
- **jsPDF (MIT)** for reports. No React/Next, Unity or Azure.

## 4. Architecture

```
index.html                 Campus (platform shell)
stream.html                Stream Health Lab (existing app; old ?class= links redirect here)
platform/
  engine/                  Shared runtime (one copy for every world)
    stage.js               renderer, sky, lights, fog, resize, performance guard
    assets.js              cached glTF loading
    player.js              student character, procedural walk, third-person camera, occlusion
    scatter.js             instanced scenery with level of detail
    interact.js            interactable objects: proximity, tap/click, highlight, prompts
    npc.js                 NPC teachers: character, idle animation, name tag, dialogue
    mission.js             mission step machine (validators, hints, feedback, scoring, checkpoints)
    assistant.js           offline "Ask" assistant over a world glossary
    progress.js            student profile, scores, badges; export/import files
    hud.js                 shared HUD, panels, dialogue box, mission tracker, toasts
  campus/campus.js         the campus world
  worlds/registry.json     list of worlds (adding a world = add a folder + one registry entry)
  worlds/<id>/manifest.json   title, subject, standards, missions, glossary
  worlds/<id>/world.js        builds the 3D scene and registers interactables and simulations
  worlds/<id>/missions/*.json data-authored missions
```

**Mission file (JSON)**: `objectives`, `npc`, `steps[]`. Each step has `prompt` and a `sequence` of actions:
`{ target, gesture: "talk|go|interact|collect|measure|place|answer", instruction, hint, validator, onSuccess: { feedback, effects[] }, points }`.
Validators: `correct_target`, `value_within`, `choice`, `count_at_least`, `free_text` (teacher-graded).
Each world registers named *effects* (for example `placeQuadrat`) and *measurements*, so missions stay pure data.

**Scoring**: points per action, hint penalties, first-try bonus, mission grade A–F, badges.
**Progress**: one local profile per student (schema-versioned). Exported as a file and gathered by the teacher into a gradebook. No server.

## 5. Delivery phases

1. **Now:** engine, campus, NPC teachers, mission engine, scoring and progress, the Biodiversity Field Station world, and the
   Stream Lab connected to the campus.
2. **Next:** move the Stream Lab onto the engine; teacher gradebook for imported progress files.
3. **Then:** new worlds such as eutrophication lake, coral reef and ocean acidification, climate and carbon cycle, soil and agriculture,
   renewable energy siting, and a geology canyon.
