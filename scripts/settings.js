export const MODULE_ID = "fatherfog-combat"

export const SETTING_KEYS = {
  ROUND_SOUND: "roundSound",
  CHECK_SOUND: "checkSound",
  TARGET_ON_SOUND: "targetOnSound",
  TARGET_OFF_SOUND: "targetOffSound",
  VOLUME: "volume",
  PORTRAIT_SIZE: "portraitSize",
  SHOW_DEFEATED: "showDefeated",
  FX_DURATION: "fxDuration",
}

Hooks.once("init", () => {
  registerSettings()
})

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTING_KEYS.ROUND_SOUND, {
    name: "Round Sound",
    hint: "Audio file played when a new round begins.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "",
    filePicker: "audio",
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.CHECK_SOUND, {
    name: "Ready Check Sound",
    hint: "Audio file played when a player marks themselves ready.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "",
    filePicker: "audio",
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.TARGET_ON_SOUND, {
    name: "Targeted Sound",
    hint: "Audio file played for a player when they become targeted.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "",
    filePicker: "audio",
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.TARGET_OFF_SOUND, {
    name: "Target Removed Sound",
    hint: "Audio file played for a player when the GM manually removes targeted.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "",
    filePicker: "audio",
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.VOLUME, {
    name: "Volume",
    hint: "Master volume for this module's sound effects.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 0,
      max: 100,
      step: 1,
    },
    default: 60,
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.PORTRAIT_SIZE, {
    name: "Portrait Size",
    hint: "Size of player portrait boxes in the tracker.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 60,
      max: 180,
      step: 2,
    },
    default: 92,
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.SHOW_DEFEATED, {
    name: "Show Defeated",
    hint: "Keep defeated player combatants visible in the tracker.",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.FX_DURATION, {
    name: "Notification Duration",
    hint: "How long important notifications stay on screen, in milliseconds.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 800,
      max: 4000,
      step: 50,
    },
    default: 1600,
  })
}
