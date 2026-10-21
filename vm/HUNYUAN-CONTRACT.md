# Hunyuan asset service contract

This is an integration boundary, not a substitute implementation of a Hunyuan model. A real model runtime must be selected, installed and verified before claiming generation works.

## Service

- Bind to `127.0.0.1:8002` on the VM; forward via SSH.
- `GET /health`: JSON status including model identity and readiness.
- `POST /generate`: take a biome, tile variants, world prompt, palette, tile size and traversal requirements. Cache outputs by biome and version, independent of the song title.

Request shape:

```json
{
  "biome": { "id": "jungle-ruins", "description": "Ancient moss-covered ruins..." },
  "variants": ["garden", "terraces", "arch", "tower", "grove", "ruins", "pond", "sanctuary"],
  "tileSize": 12,
  "prompt": "Original environment description",
  "palette": ["#79b77b", "#b2f3a0", "#e2b766"],
  "requirements": "Detailed modular 3D assets with compatible traversable boundaries."
}
```

Response shape:

```json
{
  "model": "Exact verified Hunyuan model/checkpoint identity",
  "provenance": { "checkpoint": "actual checkpoint", "seed": 42, "createdAt": "ISO timestamp" },
  "tiles": [
    { "variant": "garden", "glbUrl": "http://127.0.0.1:8002/assets/jungle-ruins/garden.glb" },
    { "variant": "terraces", "glbUrl": "http://127.0.0.1:8002/assets/jungle-ruins/terraces.glb" }
  ]
}
```

The server also accepts a full `glbUrl` for a generated world, with explicit model/provenance. A panorama alone does not satisfy the 3D tile-asset requirement.

## Geometry rules

WFC currently uses 16 edge topologies and eight interior variants per biome. Tile centers are separated by 12 units. Ground connections must meet neighbors at y=0. Traversal metadata must identify the tile's walkable surfaces and elevated platforms before replacing the reference skin. Preserve collectible visibility and known seam bridges. Validate imported bounds, pivot, materials and collision alignment in the rendered game.

For a final bank, either generate exact collision-compatible skins or provide validated collider metadata from the generated mesh. The reference colliders alone cannot prove an arbitrary imported scene is navigable.

## GPU lifecycle

Generate a small usable bank first, validate it in the actual game, cache on persistent storage, then grow the bank. Treat all 24 biome buckets as the target, not as already generated. A large catalog can grow incrementally, with shared asset categories and orientation/topology variants where appropriate. Track asset provenance, model revision, prompt, seed, license and compatible collision layout.

Measure VRAM before running the asset model alongside Nemotron and ACE-Step. Do not assume three model services fit or are compatible merely because their nominal parameter counts fit the B200.
