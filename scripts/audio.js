import { MODULE_ID } from "./settings.js"

const SOUND_KEY_MAP = {
  round: "roundSound",
  check: "checkSound",
  targetOn: "targetOnSound",
  targetOff: "targetOffSound",
}

export function playSound(type) {
  if (game.user.isGM && game.settings.get(MODULE_ID, "gmMuteSelf")) return

  const src = getSoundPathForCurrentUser(type)
  if (!src) return

  const volume = Math.max(
    0,
    Math.min(1, Number(game.settings.get(MODULE_ID, "volume") || 0) / 100),
  )

  try {
    const audio = new Audio(src)
    audio.preload = "auto"
    audio.volume = volume
    audio.play().catch(() => {})
    return audio
  } catch (_err) {
    // intentionally ignored
  }
}

export function testSound(type, userId = game.user.id) {
  if (!type) return
  const src = getSoundPathForUser(userId, type)
  if (!src) return

  const volume = Math.max(
    0,
    Math.min(1, Number(game.settings.get(MODULE_ID, "volume") || 0) / 100),
  )

  try {
    const audio = new Audio(src)
    audio.preload = "auto"
    audio.volume = volume
    audio.play().catch(() => {})
    return audio
  } catch (_err) {
    // intentionally ignored
  }
}

export function getSoundPathForCurrentUser(type) {
  return getSoundPathForUser(game.user.id, type)
}

export function getSoundPathForUser(userId, type) {
  const settingKey = SOUND_KEY_MAP[type]
  if (!settingKey) return ""

  const overrides = game.settings.get(MODULE_ID, "audioOverrides") || {}
  const perUser = overrides?.[userId] || {}
  const overrideValue = perUser?.[type]

  if (typeof overrideValue === "string" && overrideValue.trim()) {
    return overrideValue.trim()
  }

  return game.settings.get(MODULE_ID, settingKey) || ""
}
