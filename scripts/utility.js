export function playSound(type) {
  if (game.user.isGM && game.settings.get("fatherfog-combat", "gmMuteSelf")) return

  const src = getSoundPathForCurrentUser(type)
  if (!src) return

  const volume = Math.max(
    0,
    Math.min(1, game.settings.get("core", "globalInterfaceVolume")),
  )

  try {
    const audio = new Audio(src)
    audio.preload = "auto"
    audio.volume = volume
    audio.play().catch(() => {})
    return audio
  } catch (_err) {
    console.log("err", _err)
  }
}

export function testSound(type, userId = game.user.id) {
  if (!type) return
  const src = getSoundPathForUser(userId, type)
  if (!src) return

  const volume = Math.max(
    0,
    Math.min(1, game.settings.get("core", "globalInterfaceVolume")),
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
  const soundKey = {
    round: "roundSound",
    check: "checkSound",
    targetOn: "targetOnSound",
    targetOff: "targetOffSound",
  }
  const settingKey = soundKey[type]
  if (!settingKey) return ""

  const overrides = game.settings.get("fatherfog-combat", "audioOverrides") || {}
  const perUser = overrides?.[userId] || {}
  const overrideValue = perUser?.[type]

  if (typeof overrideValue === "string" && overrideValue.trim()) {
    return overrideValue.trim()
  }

  return game.settings.get("fatherfog-combat", settingKey) || ""
}
