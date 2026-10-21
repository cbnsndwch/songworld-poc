import { hash } from './world.mjs';
// Each biome is a persistent asset bucket, shared across compatible songs.
const rows = [
  ['jungle-ruins', 'Jungle of echoes', 'hard rock', '#79b77b', '#b2f3a0', '#e2b766', '#718c65', 'Ancient moss-covered ruins and giant trees suspended above a turquoise jungle lagoon'],
  ['volcanic', 'Ember kingdom', 'metal', '#c04c35', '#ffca61', '#f5a65b', '#4a3a3a', 'Basalt cliffs, cooling lava, obsidian arches and ember-lit temples'],
  ['alpine', 'Cloudbreak peaks', 'folk', '#82b9c6', '#fff4c7', '#d7eaf0', '#687f83', 'Alpine meadows, snow peaks, waterfalls and weathered stone towers'],
  ['coral', 'Coral reverie', 'dream pop', '#d98b9e', '#90ebe2', '#f5c7ac', '#9d728d', 'Giant coral gardens, pearl terraces and luminous tidal pools'],
  ['desert', 'Mirage palace', 'world', '#c69a62', '#89dcca', '#ffe6ad', '#a67a53', 'Sandstone palaces, oasis palms, desert arches and sunlit dunes'],
  ['crystal', 'Prism sanctuary', 'ambient', '#a292db', '#afffe3', '#e5cbfa', '#666b9c', 'Translucent crystal caverns, mineral pillars and luminous underground gardens'],
  ['neon', 'Afterhours arcade', 'synthwave', '#a05ac4', '#6ffff0', '#ff94d4', '#374269', 'Rain-slick retro-futurist rooftops, neon gardens and floating arcades'],
  ['moon', 'Moonflower gardens', 'rnb', '#7688c0', '#d7bdff', '#bfcdee', '#4d567c', 'Moonlit botanical gardens, silver ponds and monumental flower arches'],
  ['sunflower', 'Sunflower hills', 'pop', '#a8b96c', '#ffe08c', '#ffe7ad', '#8a9b5a', 'Rolling sunflower meadows, windmills and whimsical hilltop villages'],
  ['industrial', 'Rust & rhythm', 'industrial', '#9c7864', '#a7efdb', '#e7c286', '#69776e', 'Abandoned foundries reclaimed by nature, copper machinery and stone viaducts'],
  ['snow', 'Northern lights', 'classical', '#a0c8ce', '#a4ffda', '#cfdaff', '#7994ab', 'Snowbound towers, frozen lakes, blue ice caves and aurora-lit bridges'],
  ['rainforest', 'Emerald frequency', 'reggae', '#51a77f', '#e8f998', '#f3d181', '#426e64', 'Lush tropical canopy, colossal roots, hanging gardens and bright waterfalls'],
  ['canyon', 'Red rock radio', 'country', '#c17c60', '#f8dc9d', '#f0c29f', '#8c6f5e', 'Sweeping red rock canyons, desert mesas and winding stone bridges'],
  ['mushroom', 'Velvet sporewood', 'psychedelic', '#af789c', '#9ff1be', '#f9c4df', '#776288', 'Giant bioluminescent mushrooms, soft moss terraces and dreamlike forest glades'],
  ['ocean', 'Tidal cathedral', 'chill', '#64aeb7', '#f5dc97', '#c3edf1', '#668d98', 'Sunlit ocean islands, limestone arches, tide pools and shell-like towers'],
  ['storm', 'Thunder citadel', 'drum and bass', '#6b7f9c', '#ebd178', '#b9c8e8', '#424b69', 'Storm-swept highland citadels, dramatic cliffs and electric cloud bridges'],
  ['autumn', 'Amber orchard', 'indie', '#bc8b53', '#e8d78b', '#f2c99d', '#88734d', 'Golden autumn orchards, copper leaves, mossy ruins and warm lakes'],
  ['cyber', 'Circuit bloom', 'techno', '#5caa9f', '#f1ee83', '#9df5ed', '#47616e', 'Living circuitry, glass pavilions and luminous geometric botanical gardens'],
  ['space', 'Orbital playground', 'electronic', '#7b85bf', '#f3c4e4', '#c2d2ff', '#555d86', 'Low-gravity asteroid gardens, cosmic observatories and starlit stone rings'],
  ['gothic', 'Midnight waltz', 'gothic', '#8b7d94', '#d9b978', '#d2bee7', '#555161', 'Overgrown gothic gardens, ornate cathedral arches and violet moonlight'],
  ['savanna', 'Golden heartbeat', 'afrobeat', '#aaab68', '#f4d68b', '#f6db9c', '#777f56', 'Golden savanna plateaus, acacia trees, winding rivers and sculpted stone towers'],
  ['bamboo', 'Jade tempo', 'jazz', '#79a896', '#f2db9b', '#e1ead2', '#587d71', 'Bamboo courtyards, jade stone terraces, waterfalls and elegant mountain pavilions'],
  ['candy', 'Sugar rush skies', 'hyperpop', '#e597b4', '#a2eff4', '#ffe0b7', '#aa7fa8', 'Playful candy-colored cliffs, glossy pastel arches and cloud gardens'],
  ['meadow', 'Soft landing', 'acoustic', '#8fbca0', '#ffe6a2', '#e0eacb', '#749477', 'Peaceful wildflower meadows, ancient oaks, sunlit ponds and rolling hills']
];
export const BIOMES = rows.map(([id, name, genre, ground, accent, sky, rock, description]) => ({ id, name, genre, ground, accent, sky, rock, description }));
export function chooseBiome(song = {}, explicit) {
  if (explicit && explicit !== 'auto') return BIOMES.find(b => b.id === explicit) || BIOMES[0];
  const text = `${song.title} ${song.artist} ${song.genre || ''}`.toLowerCase();
  if (/jungle|guns.*roses|hard rock/.test(text)) return BIOMES[0];
  const found = BIOMES.find(b => text.includes(b.genre));
  return found || BIOMES[hash(`${song.artist}:${song.genre || song.title}`) % BIOMES.length];
}
