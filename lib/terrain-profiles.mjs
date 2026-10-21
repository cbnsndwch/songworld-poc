// Structural terrain recipes. Biomes share assembly tools, not one island skin.
const recipes = {
  'jungle-ruins': ['forest', 'Connected jungle valley', 0, '#477c65'],
  volcanic: ['basin', 'Volcanic basin', 1.1, '#e55a24'],
  alpine: ['mountain', 'Ascending mountain terraces', 1.35, '#82b9c6'],
  coral: ['archipelago', 'Coral shallows', 0, '#70d3ca'],
  desert: ['dunes', 'Dunes and sandstone courtyards', 0, '#b4d6c0'],
  crystal: ['cavern', 'Enclosed crystal cavern', 0, '#6b74bd'],
  neon: ['city', 'Neon street grid', 0, '#39254f'],
  moon: ['courtyard', 'Moonlit walled gardens', 0, '#647396'],
  sunflower: ['meadow', 'Open rolling countryside', 0, '#81a699'],
  industrial: ['city', 'Foundry yards and viaducts', .65, '#6a8072'],
  snow: ['mountain', 'Frozen mountain terraces', 1.1, '#acd9e5'],
  rainforest: ['forest', 'Dense tropical river valley', .45, '#3da690'],
  canyon: ['canyon', 'Winding canyon corridors', 0, '#b67950'],
  mushroom: ['cavern', 'Bioluminescent cavern glades', 0, '#735488'],
  ocean: ['archipelago', 'Sea-level coastal archipelago', 0, '#4ba3b3'],
  storm: ['sky', 'Suspended storm citadels', .8, '#526982'],
  autumn: ['meadow', 'Connected orchard landscape', 0, '#8ca8a1'],
  cyber: ['city', 'Circuit streets and glass towers', 0, '#417a80'],
  space: ['sky', 'Orbital asteroid platforms', 1.2, '#323f72'],
  gothic: ['courtyard', 'Cathedral courtyards', .4, '#756781'],
  savanna: ['canyon', 'Savanna valleys and mesas', 0, '#93a574'],
  bamboo: ['courtyard', 'Stepped bamboo courtyards', .8, '#80ad9e'],
  candy: ['sky', 'Floating candy playground', .55, '#d0a6d5'],
  meadow: ['meadow', 'Continuous wildflower landscape', 0, '#8cbfa5'],
};
export function terrainProfile(id) {
  const [kind, label, rise, water] = recipes[id] || recipes.meadow;
  return { kind, label, rise, water, continuous: !['sky', 'archipelago'].includes(kind), waterY: kind === 'archipelago' ? -.65 : -17 };
}
export function tileElevation(profile, tile) {
  const distance = Math.max(Math.abs(tile.x), Math.abs(tile.z)) / 12;
  return profile.rise * Math.max(0, distance - 1);
}
