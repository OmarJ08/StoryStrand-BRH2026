/**
 * Onboarding quick picks: one tap places 5 books. The guest response for each is also baked
 * into public/demo/guest-<key>.json (scripts/bake_demo.py) as an offline fallback.
 * Keep the ids in sync with PRESETS in scripts/bake_demo.py.
 */
export const PRESETS = [
  {
    key: "scifi",
    label: "Sci-fi fan",
    ids: ["book:18007564", "book:234225", "book:375802", "book:11", "book:29579"],
    // The Martian, Dune, Ender's Game, The Hitchhiker's Guide to the Galaxy, Foundation
  },
  {
    key: "thriller",
    label: "Thriller reader",
    ids: ["book:2429135", "book:8442457", "book:22557272", "book:21686", "book:11588"],
    // The Girl with the Dragon Tattoo, Gone Girl, The Girl on the Train, Shutter Island, The Shining
  },
  {
    key: "classics",
    label: "Classics",
    ids: ["book:1885", "book:4671", "book:2657", "book:5470", "book:10210"],
    // Pride and Prejudice, The Great Gatsby, To Kill a Mockingbird, 1984, Jane Eyre
  },
] as const;

export type PresetKey = (typeof PRESETS)[number]["key"];

/** Books with a pre-baked "Learn the real science" route (public/demo/bridge/). */
export const BAKED_BRIDGES = new Set([
  "book:18007564",   // The Martian
  "book:375802",     // Ender's Game
  "book:112537",     // Rendezvous with Rama
  "book:61666",      // Contact
  "book:77507",      // Red Mars
]);

export const bakedBridgeFile = (bookId: string) => `bridge/${bookId.replace(":", "-")}.json`;
