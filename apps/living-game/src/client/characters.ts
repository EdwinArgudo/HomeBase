import type { PersonaAppearanceV1 } from "@homebase/contracts";

// How each roster character is drawn. The contract stores only the character
// key; this is the one place that decides what that character looks like.
export type CharacterLook = {
  body: "marshmallow" | "bunny" | "cat" | "dog" | "bear" | "chick";
  pattern: "plain" | "belly" | "spots" | "patch";
  accessory: "none" | "bow" | "scarf" | "glasses" | "cap";
  name: string;
};

export const CHARACTER_LOOKS: Record<PersonaAppearanceV1["character"], CharacterLook> = {
  marshmallow: { body: "marshmallow", pattern: "plain", accessory: "none", name: "Marshmallow" },
  bunny: { body: "bunny", pattern: "belly", accessory: "bow", name: "Bunny" },
  cat: { body: "cat", pattern: "spots", accessory: "scarf", name: "Cat" },
  pup: { body: "dog", pattern: "patch", accessory: "none", name: "Pup" },
  bear: { body: "bear", pattern: "belly", accessory: "cap", name: "Bear" },
  chick: { body: "chick", pattern: "plain", accessory: "none", name: "Chick" },
  "moss-bunny": { body: "bunny", pattern: "plain", accessory: "glasses", name: "Moss Bunny" },
  "dusk-cat": { body: "cat", pattern: "belly", accessory: "bow", name: "Dusk Cat" },
};

export const DEFAULT_CHARACTER: PersonaAppearanceV1["character"] = "marshmallow";

export function characterLook(character: PersonaAppearanceV1["character"] | undefined): CharacterLook {
  return CHARACTER_LOOKS[character ?? DEFAULT_CHARACTER];
}
