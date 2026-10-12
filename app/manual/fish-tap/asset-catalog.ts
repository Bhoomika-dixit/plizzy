/** Maps stable game asset IDs to their local development files. */
import fishImage from "./assets/sprites/fish.jpg";

export const fishTapAssets = {
  fish: {
    id: "fish",
    src: fishImage,
    alt: "A tappable fish",
  },
} as const;
