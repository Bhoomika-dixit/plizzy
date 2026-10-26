export const requiredTextSlots = ["welcome.title", "welcome.instructions", "hud.scoreLabel", "hud.timerLabel", "result.winTitle", "result.loseTitle", "result.playAgain"] as const;

export const textCatalog = {
  implementation: "named_text_resolver",
  requiredSlots: requiredTextSlots,
  optionalSlots: ["sideScroller.tapHint", "sideScroller.scoreUnit"],
} as const;
