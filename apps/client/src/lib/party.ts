// Each survivor's colour, from their seed: their dot on the HUD and the map, and the dye of their coat.
// Eight that stay apart on snow and in the dark, none of them the Column's ember.
export const PARTY = ["#5fb3d9", "#e0c35a", "#8fd18a", "#d97a9c", "#a08be0", "#e0e0e0", "#5fd1c0", "#d9965f"];

export const partyColor = (seed: number) => PARTY[seed % PARTY.length];
