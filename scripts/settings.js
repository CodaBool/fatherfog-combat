import "./ui.js"

const SETTING_KEYS = {
  ROUND_SOUND: "roundSound",
  CHECK_SOUND: "checkSound",
  TARGET_ON_SOUND: "targetOnSound",
  TARGET_OFF_SOUND: "targetOffSound",
  VOLUME: "volume",
  PORTRAIT_SIZE: "portraitSize",
  FX_DURATION: "fxDuration",
  GM_MUTE_SELF: "gmMuteSelf",
  AUDIO_OVERRIDES: "audioOverrides",
}

Hooks.once("init", () => {
  registerSettings()
})

export function registerSettings() {

  game.settings.register("fatherfog-combat", SETTING_KEYS.ROUND_SOUND, {
    name: "Round Sound",
    hint: "Default audio file played when a new round begins.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/fallout.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.CHECK_SOUND, {
    name: "Ready Check Sound",
    hint: "Default audio file played when a player marks themselves ready.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/sh2_item.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.TARGET_ON_SOUND, {
    name: "Targeted Sound",
    hint: "Default audio file played for a player when they become targeted.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/sh3_menu.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.TARGET_OFF_SOUND, {
    name: "Target Removed Sound",
    hint: "Default audio file played for a player when the GM manually removes targeted.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/sh2_menu.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.VOLUME, {
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
    default: 15,
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.PORTRAIT_SIZE, {
    name: "Portrait Width",
    hint: "Width of portrait cards. Height is derived automatically.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 100,
      max: 220,
      step: 2,
    },
    default: 156,
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.FX_DURATION, {
    name: "Notification Duration",
    hint: "How long important notifications stay on screen, in milliseconds.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 800,
      max: 8000,
      step: 50,
    },
    default: 4500,
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.GM_MUTE_SELF, {
    name: "Mute Audio For GMs",
    hint: "If enabled, Game Masters will not hear this module's sounds on their own client.",
    scope: "client",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  })

  game.settings.register("fatherfog-combat", SETTING_KEYS.AUDIO_OVERRIDES, {
    name: "Audio Overrides Data",
    hint: "Per-user sound overrides.",
    scope: "world",
    config: false,
    restricted: true,
    type: Object,
    default: {},
  })

  game.settings.registerMenu("fatherfog-combat", "audioOverridesMenu", {
    name: "Per-Player Audio Overrides",
    label: "Configure",
    hint: "Override round, ready, targeted, and target removed sounds per user.",
    icon: "fas fa-sliders",
    type: FatherfogCombatAudioOverridesApp,
    restricted: true,
  })
}
