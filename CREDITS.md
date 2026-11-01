# Credits

All 3D models are released under **CC0 (public domain)**. Credit isn't required, but these artists made this lab possible.

| Models | Artist | Source | License |
|---|---|---|---|
| Trees, pines, bushes, stones, grass, flowers, plants, stumps, clouds (`assets/nature/`) | flo-bit | [Low Poly Nature Pack](https://github.com/flo-bit/low-poly-asset-packs) · [itch.io](https://flo-bit.itch.io/low-poly-nature-pack) | CC0 |
| Student characters (`assets/characters/`) | Quaternius | [Ultimate Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) and [Ultimate Modular Women](https://quaternius.com/packs/ultimatemodularwomen.html), via [quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase) | CC0 |
| Cow, corn, wheat (`assets/farm/`) | Quaternius | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html), [Ultimate Crops Pack](https://quaternius.com/packs/ultimatecrops.html) | CC0 |
| Town buildings, cars, streetlights, bench (`assets/town/`) | Kay Lousberg | [KayKit City Builder Bits](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) · [kaylousberg.com](https://www.kaylousberg.com) | CC0 |

| NPC teachers (`npc_ranger`, `npc_scientist`) | Quaternius | Ultimate Modular Men (Adventurer) and Women (Suit) | CC0 |

| Lab ceiling light (`assets/lab/ceilinglight.fbx`) | pcraven, via [Blend Swap #6689](http://www.blendswap.com/blends/view/6689); included in [Maroon](https://github.com/GameLabGraz/Maroon) | Ceiling Light | **CC0** |
| Lab whiteboard (`assets/lab/whiteboard.fbx`) | **Cineca VisitLab**, via [Blend Swap #80963](http://www.blendswap.com/blends/view/80963); included in [Maroon](https://github.com/GameLabGraz/Maroon) | Mobile white marker board | **CC-BY 3.0** (attribution required) |

License texts for the two Maroon models are kept beside them in `assets/lab/`.

Code libraries: [three.js](https://threejs.org) (MIT) and [jsPDF](https://github.com/parallax/jsPDF) (MIT).

## What came from the four reference projects
- **ScienceLab 3D** (Rudra Sarker, MIT): the Life Science Lab's food web, natural selection and photosynthesis experiments
  are ported from its ecosystem, natural-selection and photosynthesis scenes, including its trophic color scheme and its
  photosynthesis explanation text. Fixed in the port: frame-rate-dependent motion, unseeded randomness, and an energy model
  that didn't follow the 10% rule.
- **Maroon** (TU Graz Game Lab): the lab-room layout with circular station markers. Maroon's own code and models have **no license**,
  so only the two third-party models above (which carry their own CC licenses) were used.
- **VossLab virtual-lab-protocol-simulation** (Neil Voss; code LGPL-3.0, content CC-BY-4.0): EarthLab's mission format
  (steps → target, gesture, instruction, hint, validator, feedback) and checkpointed, schema-versioned saving are re-implemented
  from its design. The campus's **Cell Biology Bench** portal opens VossLab's published simulator.
- **HandsOn** (VietTung0801, MIT): carrying equipment (its grab system), dropped objects falling under gravity, field notes
  placed anywhere in the world, and a lab assistant students can ask questions (EarthLab's runs offline, with no cloud keys).

Character animation, water, sky, terrain, organism drawings and all science content were made for this lab.
