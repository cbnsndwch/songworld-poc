# Songworld

Session stopped for VM deprovisioning at the user's request. See [the session handoff](sessions/2026-10-12.json) for verified results, unfinished work, hardware lessons and the local backup. Cloud services are stopped; local playtesting remains available.

A personal 3D platformer inspired by the freedom and discovery of Super Mario 64, with modern Three.js rendering. Search a real track; use its artwork, lyric themes and artist context to create an original world and soundtrack. Songs share reusable biome asset banks instead of requiring a fresh world model run every time.

## Run locally

Requires Node.js 24 or newer.

```powershell
npm install
npm start
```

Open http://127.0.0.1:4310. The server binds to loopback.

- WASD / arrows: move freely relative to the camera.
- Space: jump (buffered input and coyote time).
- Shift: sprint.
- Mouse drag / Q and E: orbit the camera. Mouse wheel: zoom.
- Escape / P: pause.
- Controls / Pause → Gameplay controls: persistent camera, turning, movement and air control sliders. Responsive and Gentle presets apply immediately.
- Find three resonance relics on the high terraces, then return to the central shrine.

## Current implementation and verification limits

The local playtest is playable without cloud spend. It has a smoothly animated character, camera orbit, terrain collision, vertical platforms, collectible relics, checkpoints, an original browser synth test loop, WFC tile assembly, 24 selectable biome definitions, MusicBrainz search, cover palette extraction, a replay library, persistent preferences and personal bests.

The 24 biome **definitions** and 128 tile **briefs** per biome exist in code. These are not 3,072 already-generated Hunyuan assets. A first structural terrain pass adds connected forest ground, city street grids with solid buildings, enclosed caverns, mountain terraces, walled courtyards, canyon mesas, sea-level archipelagos and suspended sky platforms. WFC favors city intersections and narrower canyon/mountain routes. These remain procedural prototypes with shared platforming obstacles; distinct generated biome asset banks are still to be produced on the VM.

Generated GLBs are downloaded to the local asset cache and reused by biome. Their triangle geometry supplies capsule collisions, with one shared collision tree per asset variant. Tests cover mesh landing, jumping, wall blocking and translated instances using explicit test geometry. The first real Hunyuan jungle arch has completed shape and PBR inference, passed GLB structure checks (42,436 vertices, embedded textures), and rendered in the game. Complete-level traversability and full tile bank coverage remain unverified. Generated landmarks currently supplement the visible playable platforms; complete generated tile replacement remains unfinished.

Nemotron and ACE-Step API adapters are implemented. Tests verify their request/response handling against local protocol fixtures. The connected Nebius VM actually has one H200 (about 141 GB VRAM), not a B200. CUDA compute and real Hunyuan3D 2.1 shape/PBR inference are verified. Nemotron 120B FP8 weights are downloaded and loading; ACE-Step checkpoints are downloaded. Story and music inference remain unverified. HY World 2.0 installation is in progress. The Plannotator review selected Hunyuan3D 2.1 for tiles, a local HY World 2.0 experiment, and SSH profile `nebius-gpu-vm`. Installation scripts and real pipeline workers are in [vm/README.md](vm/README.md).

The previous lane-based runner implementation in `public/game.js` is superseded by `public/adventure-game.js` and is not imported by the app.

## Real model connections

Use the gear icon to set local service URLs, or copy `.env.example` to `.env`. Store API keys only in `.env`; the browser never receives them. Prefer SSH port forwarding when services run on Nebius:

```powershell
ssh -N -L 18000:127.0.0.1:8000 -L 18001:127.0.0.1:8001 -L 18002:127.0.0.1:8002 nebius-gpu-vm
```

The intended services are Nemotron on 8000, ACE-Step on 8001 and the Hunyuan adapter on 8002. Service installation must match the selected Hunyuan product and available B200 image. GPU memory must be measured before keeping the full stack resident; generate reusable tile banks first and unload the asset model when appropriate.

### Generation flow

1. Search MusicBrainz for recording, artist and release IDs.
2. Load Cover Art Archive artwork through the local server; extract a usable color palette in the browser.
3. Fetch available lyrics from LRCLIB and artist tags from MusicBrainz. Lyrics remain server-side context; Nemotron creates original themes and objectives.
4. Nemotron returns a bounded level/story plan and a general instrumental music prompt. A song's BPM is an estimate unless a measured value is supplied.
5. ACE-Step generates an original instrumental soundtrack at the target tempo and duration. It does not reproduce the input recording. The server saves the completed audio locally.
6. Select a reusable biome bank. Hunyuan produces/caches actual 3D tile assets; WFC selects compatible modules and arrangements.
7. The client loads GLB assets, animates the character and runs gameplay locally.

### Hunyuan distinction

**HY World 2.1** is the originally requested world model. Tencent's public World repository links the 2.1 hosted product but currently documents downloadable 2.0 inference. **Hunyuan3D 2.1** is a separate downloadable mesh generator. The user selected Hunyuan3D 2.1 for modular tiles and requested an attempt to run HY World 2.0 locally, with no Tencent cloud inference.

The adapter contract is documented in [vm/HUNYUAN-CONTRACT.md](vm/HUNYUAN-CONTRACT.md). Merely implementing this contract is not proof that Hunyuan inference runs.

## Tests

```powershell
npm test
```

Tests cover WFC edge compatibility, connected relic locations across all 24 biome definitions, stable seeds, bounded physics parameters and the Nemotron/ACE-Step protocols. Browser checks cover rendering, movement, jumping and pause. A full human playthrough and live GPU inference remain necessary.

## Local persistence

- Browser localStorage: preferences, last song, replay library, run history and personal bests.
- `data/`: generated soundtracks, generation records, cover cache and nonsecret connection settings.
- `.env`: optional local credentials, ignored by Git.

Keep the generated asset bank and soundtracks on persistent storage so stopping the VM does not discard them.

## Reference asset credits

Local reference assets are placeholders for Hunyuan-generated biome banks, not claimed as AI outputs:

- [Coastal Cliff 01](https://polyhaven.com/a/coastal_cliff_01), [Island Tree 03](https://polyhaven.com/a/island_tree_03), [Rocky Terrain 02](https://polyhaven.com/a/rocky_terrain_02): Poly Haven, CC0. Models are simplified for real-time rendering.
- [RobotExpressive](https://threejs.org/examples/webgl_animation_skinning_morph.html): Quaternius, distributed in the Three.js example assets; original character by Quaternius under CC0.
- Three.js: MIT. Other dependency licenses remain with their packages.

## Primary references

- [Hackathon resources](https://nebiusglobalaihackathon.devpost.com/resources)
- [HY World repository](https://github.com/Tencent-Hunyuan/HY-World-2.0)
- [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)
- [Nemotron Super NVFP4 model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4)
- [ACE-Step API protocol](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md)
