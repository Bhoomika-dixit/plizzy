import { assetCatalog } from "./assets/manifest";
import { behaviourCatalog } from "./entity-behaviours/manifest";
import { interactionCatalog } from "./interactions/manifest";
import { rendererCatalog } from "./renderers/manifest";
import { ruleCatalog } from "./rules/manifest";
import { requiredTextSlots, textCatalog } from "./text/manifest";

export { assetCatalog, behaviourCatalog, interactionCatalog, rendererCatalog, ruleCatalog, requiredTextSlots, textCatalog };

export function capabilityCatalogueForPrompt() {
  return JSON.stringify({ renderers: rendererCatalog, interactions: interactionCatalog, behaviours: behaviourCatalog, rules: ruleCatalog, assets: assetCatalog, text: textCatalog }, null, 2);
}
