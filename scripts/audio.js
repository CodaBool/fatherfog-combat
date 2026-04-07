import { MODULE_ID, SETTING_KEYS } from "./settings.js"

const SOUND_KEY_MAP = {
  round: SETTING_KEYS.ROUND_SOUND,
  check: SETTING_KEYS.CHECK_SOUND,
  targetOn: SETTING_KEYS.TARGET_ON_SOUND,
  targetOff: SETTING_KEYS.TARGET_OFF_SOUND,
}

export function playSound(type) {
  const settingKey = SOUND_KEY_MAP[type]
  if (!settingKey) return

  const src = game.settings.get(MODULE_ID, settingKey)
  if (!src) return

  const volume = Math.max(
    0,
    Math.min(1, Number(game.settings.get(MODULE_ID, SETTING_KEYS.VOLUME) || 0) / 100),
  )

  try {
    const audio = new Audio(src)
    audio.preload = "auto"
    audio.volume = volume
    audio.play().catch(() => {})
    return audio
  } catch (_err) {
    // swallow intentionally
  }
}

export function testSound(type) {
  return playSound(type)
}
