// Each survivor's colour, from their seed: their dot on the HUD and the map, and the dye of their coat.
// Eight that stay apart on snow and in the dark, none of them the Column's ember.
export const PARTY = ["#5fb3d9", "#e0c35a", "#8fd18a", "#d97a9c", "#a08be0", "#e0e0e0", "#5fd1c0", "#d9965f"];

export const partyColor = (seed: number) => PARTY[seed % PARTY.length];

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Until there's a lobby to choose one in, everyone is given a name the district would know.
const NAMES =
  "Anya Boris Dasha Fyodor Galya Ilya Katya Kolya Lyosha Masha Misha Nadya Olya Pasha Sasha Tolya Vera Yura Zhenya Zoya".split(
    " ",
  );

export const randomName = () => NAMES[randomSeed() % NAMES.length];
