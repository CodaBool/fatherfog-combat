import "./ui.js"

Hooks.once("init", () => {
  game.settings.register("fatherfog-combat", "roundSound", {
    name: "Round Sound",
    hint: "Default audio file played when a new round begins.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/generic_3.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", "checkSound", {
    name: "Ready Check Sound",
    hint: "Default audio file played when a player marks themselves ready.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/generic_4.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", "targetOnSound", {
    name: "Targeted Sound",
    hint: "Default audio file played for a player when they become targeted.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/generic_1.mp3",
    filePicker: "audio",
  })

  game.settings.register("fatherfog-combat", "targetOffSound", {
    name: "Target Removed Sound",
    hint: "Default audio file played for a player when the GM manually removes targeted.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "modules/fatherfog-combat/audio/generic_5.mp3",
    filePicker: "audio",
  })


  game.settings.register("fatherfog-combat", "timer", {
    name: "timer",
    hint: "How many seconds for each turn",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 0,
      max: 120,
      step: 1,
    },
    default: 20,
  })

  game.settings.register("fatherfog-combat", "fxDuration", {
    name: "Notification Duration",
    hint: "How long notifications stay on screen, in seconds.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 1,
      max: 20,
      step: 1,
    },
    default: 5,
  })

  game.settings.register("fatherfog-combat", "gmMuteSelf", {
    name: "Mute Audio For GMs",
    hint: "If enabled, Game Masters will not hear this module's sounds on their own client. Target is always a player only sound.",
    scope: "client",
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  })

  game.settings.register("fatherfog-combat", "audioOverrides", {
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
})
