# EarthLab: virtual field science for AP Environmental Science

A free, browser-based 3D science campus for Earth, environmental and biological science.
It works on laptops and iPads, with no installs, no accounts and no server.

## Pages
- `index.html`: **EarthLab Campus**, the hub. Students create a profile, meet Dr. Rivera, and walk through portals to field stations.
- `world.html?w=<id>`: a field station built on the shared engine (currently `biodiversity`).
- `stream.html`: the Stream Health Lab, with class codes, groups and PDF reports. Old `index.html?class=…` links redirect here.
- `teacher.html`: Stream Lab teacher tools (class codes, groups, answer keys). **Don't share this link with students.**

## Field stations
| Station | Status | What students do |
|---|---|---|
| Watershed Science (Stream Health) | Open | Kick-net macroinvertebrates, water tests, water-quality index, pollution-source mystery |
| Biodiversity Field Station | Open | Quadrat sampling in three habitats, species richness, Simpson's index, invasive species, conservation plan |
| Life Science Lab | Open | Food webs and trophic cascades (10% rule), natural selection by camouflage, photosynthesis and light (Elodea bubble counts) |
| Cell Biology Bench | Open | VossLab's cell-culture and SDS-PAGE protocol simulator, hosted in `vosslab/` |
| Eutrophication Lake, Coral Reef & Ocean, Climate & Carbon, Soil & Farm, Renewable Energy | Planned | Portals show "coming soon" |

Controls everywhere: W A S D or the arrow keys (or the joystick on iPad) to move, Shift to run, Space to jump, drag to look,
E (or tap the green button) to interact. 📝 Note leaves a field note at your spot.

## How a field station works
- **NPC teachers** give briefings and react to each mission step.
- **Missions** are JSON files (`platform/worlds/<id>/missions/*.json`). Each step lists a target, a gesture (talk, go, collect,
  place, measure, answer), an instruction, a hint, a validator and feedback. Teachers or developers can write new missions without coding.
- **Scoring:** points per task; hints cost 30%, wrong tries 25%, misidentifications 10%. Grades run A–F, and 70% or more earns a badge.
- **Progress** saves after every action. If the mission file changes, old checkpoints are safely discarded.
- **Data differ per student** (seeded from their email), so answers can't be copied.
- The **Ask** button is an offline assistant that answers from each station's glossary. Nothing leaves the device.

## Adding a new field station
1. Create `platform/worlds/<id>/` with `manifest.json` (title, missions, glossary), `world.js` (exports `createWorld`) and `missions/`.
2. Add one entry to `platform/worlds/registry.json` with `"type": "world", "status": "open"`. A portal appears on the campus automatically.
No build step is needed. The engine in `platform/engine/` handles the character, camera, NPCs, missions, scoring and saving.

## Progress and grading
- Students open **Passport** on the campus to see scores and badges and to download a progress file (to hand in or to move devices).
- Stream Lab students still download their PDF report at the end of that lab.

## Hosting
Any static host works (currently GitHub Pages). Students need internet while working, because the 3D engine and PDF tool load from public CDNs.

## Credits and design
See [CREDITS.md](CREDITS.md) (all 3D art is CC0) and [PLATFORM_PLAN.md](PLATFORM_PLAN.md) (repository analysis and architecture).

## Science notes (Stream Lab)
- Water-quality index modeled on the Izaak Walton League "Save Our Streams" method.
- Dissolved oxygen is computed from temperature-dependent saturation.
- Mystery mode sources: sewage, thermal pollution, construction sediment, agricultural drainage.
