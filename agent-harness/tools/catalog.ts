import { capabilityCatalogueForPrompt } from "@/catalogue/manifests";
import { assetCatalog } from "@/catalogue/assets/manifest";
import { behaviourCatalog } from "@/catalogue/entity-behaviours/manifest";
import { interactionCatalog } from "@/catalogue/interactions/manifest";
import { rendererCatalog } from "@/catalogue/renderers/manifest";
import { ruleCatalog } from "@/catalogue/rules/manifest";
import { requiredTextSlots } from "@/catalogue/text/manifest";

export { assetCatalog, behaviourCatalog, interactionCatalog, rendererCatalog, ruleCatalog, requiredTextSlots };
export type { AssetKind } from "@/catalogue/assets/manifest";
export type { BehaviourId } from "@/catalogue/entity-behaviours/manifest";
export type { InteractionId } from "@/catalogue/interactions/manifest";
export type { RendererId } from "@/catalogue/renderers/manifest";
export type { RuleEffectType, RuleEvent, RuleOperator } from "@/catalogue/rules/manifest";

export const capabilityCatalogForPrompt = capabilityCatalogueForPrompt;
