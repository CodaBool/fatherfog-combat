import { playSound } from "./utility.js"

let trackerEl = null
let trackerBodyEl = null
let trackerRoundEl = null
let fxHostEl = null

let turnBannerEl = null
let turnBannerTimerTextEl = null
let turnBannerBodyEl = null
let turnBannerSkipWrapEl = null
let nextUpBannerEl = null
let lastTurnBannerState = null
let lastNextUpBannerState = null
let socketBound = false
let renderQueued = false
let bannerInterval = null

const SOCKET_ACTIONS = {
  TOGGLE_READY: "toggleReady",
  SET_TARGETED: "setTargeted",
  CLEAR_STATES: "clearStates",
  REQUEST_SKIP: "requestSkip",
}

const FLAG_KEYS = {
  READY: "ready",
  TARGETED: "targeted",
}

const COMBAT_FLAG_SCOPE = "fatherfog-combat"
const COMBAT_FLAG_KEYS = {
  TIMER: "turnTimer",
}

Hooks.once("init", () => {
  window.FatherfogCombatFX = {
    notify: notifyFx,
  }

  window.FatherfogCombat = {
    render: renderTracker,
    clearStates: () =>
      clearCombatActorStates(getActiveCombat(), { reason: "manual-clear" }),
    nextRound: () => gmAdvanceRound(),
    setTargetedByActorId: async (actorId, targeted = true) => {
      const actor = game.actors.get(actorId)
      if (!actor) return
      return setActorTargeted(actor, targeted, { manual: true })
    },
    toggleTargetedByActorId: async actorId => {
      const actor = game.actors.get(actorId)
      if (!actor) return
      return setActorTargeted(actor, !isTargeted(actor), { manual: true })
    },
    setReadyByActorId: async (actorId, ready = true) => {
      const actor = game.actors.get(actorId)
      if (!actor) return
      return setActorReady(actor, ready)
    },
    toggleReadyByActorId: async actorId => {
      const actor = game.actors.get(actorId)
      if (!actor) return
      return setActorReady(actor, !isReady(actor))
    },
    debugStartTimer: async () => {
      if (!game.user.isGM) return
      const combat = getActiveCombat()
      if (!combat?.started) return
      await startTimerForCurrentCombatant(combat)
    },
  }
})

Hooks.once("ready", () => {
  bindSocket()
  installTracker()
  installTurnBanners()
  registerHooks()
  startBannerTicker()
  renderTracker()
})

function registerHooks() {
  Hooks.on("combatStart", async combat => {
    if (game.user.isGM) {
      await clearCombatActorStates(combat, { reason: "combat-start" })
      await startTimerForCurrentCombatant(combat)
    }
    showRoundStartFx(combat?.round ?? 1)
    queueRender()
  })

  Hooks.on("pauseGame", async paused => {
    const combat = getActiveCombat()
    if (!combat?.started || !game.user.isGM) return

    const timer = getTurnTimer(combat)
    if (!timer?.combatantId) return

    if (paused) {
      const remainingMs = timer.paused
        ? Math.max(0, Number(timer.remainingMs) || 0)
        : Math.max(0, (Number(timer.expiresAt) || 0) - Date.now())

      await setTurnTimer(combat, {
        ...timer,
        paused: true,
        remainingMs,
        expiresAt: null,
      })

      return
    }

    if (!timer.paused) return

    const remainingMs = Math.max(0, Number(timer.remainingMs) || 0)
    const now = Date.now()

    await setTurnTimer(combat, {
      ...timer,
      paused: false,
      startedAt: now,
      expiresAt: now + remainingMs,
    })
  })

  Hooks.on("deleteCombat", async combat => {
    if (game.user.isGM) {
      await clearCombatActorStates(combat, { reason: "combat-end" })
      await clearTurnTimer(combat)
    }
    removeTracker()
    hideTurnBanner()
    hideNextUpBanner()
  })

  Hooks.on("createCombatant", queueRender)
  Hooks.on("deleteCombatant", queueRender)
  Hooks.on("renderCombatTracker", queueRender)

  Hooks.on("updateCombat", async (combat, changed) => {
    if (!combat?.started) {
      queueRender()
      return
    }

    if (Object.prototype.hasOwnProperty.call(changed, "round")) {
      if (game.user.isGM) {
        await clearCombatActorStates(combat, { reason: "round-change" })
        await startTimerForCurrentCombatant(combat)
      }
      showRoundStartFx(combat.round)
    }

    if (Object.prototype.hasOwnProperty.call(changed, "turn")) {
      if (game.user.isGM) {
        await startTimerForCurrentCombatant(combat)
      }
    }

    const timerChanged = foundry.utils.getProperty(
      changed,
      `flags.${COMBAT_FLAG_SCOPE}.${COMBAT_FLAG_KEYS.TIMER}`,
    )
    if (timerChanged !== undefined) {
      updateTurnBanners()
    }

    queueRender()
  })

  Hooks.on("updateActor", async (actor, changed, options) => {
    const flagPath = `flags.fatherfog-combat`
    const changedFlags = foundry.utils.getProperty(changed, flagPath)
    if (!changedFlags) return

    const readyChanged = Object.prototype.hasOwnProperty.call(
      changedFlags,
      FLAG_KEYS.READY,
    )
    const targetedChanged = Object.prototype.hasOwnProperty.call(
      changedFlags,
      FLAG_KEYS.TARGETED,
    )

    if (targetedChanged && actor.isOwner && !game.user.isGM) {
      const manual = options?.["fatherfog-combat"]?.manualTargetToggle === true
      const nowTargeted = changedFlags[FLAG_KEYS.TARGETED] === true

      if (nowTargeted) {
        notifyFx({
          title: "TARGETED",
          subtitle: actor.name,
          disposition: "bad",
          icon: "fa-solid fa-swords",
        })
        playSound("targetOn")
      } else if (manual) {
        notifyFx({
          title: "TARGET REMOVED",
          subtitle: actor.name,
          disposition: "good",
          icon: "fa-solid fa-shield-check",
        })
        playSound("targetOff")
      }
    }

    if (readyChanged && game.user.isGM) {
      const combat = getActiveCombat()
      if (combat?.started) {
        await maybeAdvanceAfterReadyChange(combat, actor)
      }
    }

    queueRender()
  })
}

function bindSocket() {
  if (socketBound) return
  socketBound = true

  game.socket.on(`module.fatherfog-combat`, async payload => {
    if (!game.user.isGM) {
      return
    }

    if (!payload || payload.type !== "fatherfog-combat") {
      return
    }

    const { action, actorId, value, requesterUserId } = payload
    const actor = actorId ? game.actors.get(actorId) : null

    if (action === SOCKET_ACTIONS.TOGGLE_READY && actor) {
      await setActorReady(actor, !isReady(actor))
      return
    }

    if (action === SOCKET_ACTIONS.SET_TARGETED && actor) {
      await setActorTargeted(actor, !!value, { manual: true })
      return
    }

    if (action === SOCKET_ACTIONS.CLEAR_STATES) {
      await clearCombatActorStates(getActiveCombat(), {
        reason: "socket-clear",
      })
      return
    }

    if (action === SOCKET_ACTIONS.REQUEST_SKIP && actor) {
      const combat = getActiveCombat()
      if (!combat?.started) return
      await gmSkipCombatant(combat, actor, requesterUserId)
    }
  })
}

function installTracker() {
  ensureFxHost()

  if (trackerEl) return

  trackerEl = document.createElement("section")
  trackerEl.id = `fatherfog-combat-tracker`
  trackerEl.className = "ffc-tracker"

  const headerEl = document.createElement("div")
  headerEl.className = "ffc-header"

  trackerRoundEl = document.createElement("div")
  trackerRoundEl.className = "ffc-round"

  const gmControlsEl = document.createElement("div")
  gmControlsEl.className = "ffc-gm-controls"

  const nextRoundBtn = document.createElement("button")
  nextRoundBtn.type = "button"
  nextRoundBtn.className = "ffc-btn"
  nextRoundBtn.dataset.action = "next-round"
  nextRoundBtn.innerHTML = `<i class="fa-solid fa-forward-step"></i><span>Next Round</span>`
  nextRoundBtn.addEventListener("click", gmAdvanceRound)

  gmControlsEl.appendChild(nextRoundBtn)

  headerEl.appendChild(trackerRoundEl)
  headerEl.appendChild(gmControlsEl)

  trackerBodyEl = document.createElement("div")
  trackerBodyEl.className = "ffc-body"

  trackerEl.appendChild(headerEl)
  trackerEl.appendChild(trackerBodyEl)

  document.body.appendChild(trackerEl)
}

function removeTracker() {
  trackerEl?.remove()
  trackerEl = null
  trackerBodyEl = null
  trackerRoundEl = null
}

function ensureFxHost() {
  if (fxHostEl) return fxHostEl
  fxHostEl = document.createElement("div")
  fxHostEl.id = `fatherfog-combat-fx-host`
  fxHostEl.className = "ffc-fx-host"
  document.body.appendChild(fxHostEl)
  return fxHostEl
}

function installTurnBanners() {
  if (!turnBannerEl) {
    turnBannerEl = document.createElement("section")
    turnBannerEl.id = "fatherfog-combat-turn-banner"
    turnBannerEl.className = "ffc-turn-banner ffc-hidden"
    turnBannerEl.innerHTML = `
      <div class="ffc-turn-banner-inner">
        <div class="ffc-turn-timer-row">
          <div class="ffc-turn-timer">
            <i class="fa-solid fa-hourglass fa-bounce"></i>
            <span class="ffc-turn-timer-text">${game.settings.get("fatherfog-combat", "timer")}</span>
          </div>
        </div>
        <div class="ffc-turn-banner-body"></div>
        <div class="ffc-turn-banner-actions"></div>
      </div>
    `
    document.body.appendChild(turnBannerEl)
    turnBannerTimerTextEl = turnBannerEl.querySelector(".ffc-turn-timer-text")
    turnBannerBodyEl = turnBannerEl.querySelector(".ffc-turn-banner-body")
    turnBannerSkipWrapEl = turnBannerEl.querySelector(
      ".ffc-turn-banner-actions",
    )
  }

  if (!nextUpBannerEl) {
    nextUpBannerEl = document.createElement("section")
    nextUpBannerEl.id = "fatherfog-combat-nextup-banner"
    nextUpBannerEl.className = "ffc-nextup-banner ffc-hidden"
    document.body.appendChild(nextUpBannerEl)
  }
}

function startBannerTicker() {
  if (bannerInterval) return
  bannerInterval = window.setInterval(async () => {
    updateTurnBanners()

    if (!game.user.isGM) return

    const combat = getActiveCombat()
    if (!combat?.started) return

    const timer = getTurnTimer(combat)
    if (!timer?.combatantId) return
    if (timer.paused) return
    if (!timer?.expiresAt) return

    if (Date.now() >= timer.expiresAt) {
      await gmHandleTimerExpired(combat, timer.combatantId)
    }
  }, 250)
}

function queueRender() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    renderTracker()
  })
}

function getActiveCombat() {
  return game.combat ?? game.combats?.active ?? null
}

function getTrackedCombatants(combat = getActiveCombat()) {
  if (!combat) return []
  const source = combat.turns?.length
    ? combat.turns
    : combat.combatants.contents
  return source.filter(c => {
    const actor = c.actor
    if (!actor) return false
    if (!actor.hasPlayerOwner) return false
    return true
  })
}

function getPendingCombatants(combat = getActiveCombat()) {
  return getTrackedCombatants(combat).filter(
    c => !c.isDefeated && !isReady(c.actor),
  )
}

function getCurrentCombatant(combat = getActiveCombat()) {
  if (!combat?.started) return null
  return combat.combatant ?? combat.turns?.[combat.turn] ?? null
}

function getCurrentTrackedCombatant(combat = getActiveCombat()) {
  const c = getCurrentCombatant(combat)
  if (!c?.actor?.hasPlayerOwner || c.isDefeated) return null
  return c
}

function getCurrentRoundPendingOrder(combat = getActiveCombat()) {
  if (!combat?.started) return []

  const tracked = getTrackedCombatants(combat)
  if (!tracked.length) return []

  const current = getCurrentTrackedCombatant(combat)
  if (!current) return tracked.filter(c => !c.isDefeated && !isReady(c.actor))

  const turns = combat.turns ?? []
  const currentIndex = turns.findIndex(c => c.id === current.id)
  if (currentIndex < 0) return []

  return turns
    .slice(currentIndex)
    .filter(c => c?.actor?.hasPlayerOwner && !c.isDefeated && !isReady(c.actor))
}

function getNextPendingCombatantThisRound(combat = getActiveCombat()) {
  const order = getCurrentRoundPendingOrder(combat)
  if (order.length <= 1) return null
  return order[1] ?? null
}

function renderTracker() {
  const combat = getActiveCombat()

  if (!combat || !combat.started) {
    if (trackerEl) trackerEl.classList.add("ffc-hidden")
    hideTurnBanner()
    hideNextUpBanner()
    return
  }

  installTracker()
  trackerEl.classList.remove("ffc-hidden")

  const showGm = game.user.isGM
  const nextRoundBtn = trackerEl.querySelector('[data-action="next-round"]')
  if (nextRoundBtn) nextRoundBtn.style.display = showGm ? "" : "none"

  trackerRoundEl.textContent = `Round ${combat.round || 1}`

  const width = 156
  const height = Math.round(width * 1.4)

  trackerEl.style.setProperty("--ffc-portrait-width", `${width}px`)
  trackerEl.style.setProperty("--ffc-portrait-height", `${height}px`)

  trackerBodyEl.replaceChildren()

  const combatants = getTrackedCombatants(combat)

  for (const combatant of combatants) {
    trackerBodyEl.appendChild(createPortraitCard(combatant))
  }
}

function createPortraitCard(combatant) {
  const actor = combatant.actor
  const canToggleReady = actor?.isOwner
  const ready = isReady(actor)
  const targeted = isTargeted(actor)
  const isCurrent = getCurrentTrackedCombatant()?.id === combatant.id
  const hpPercent = getNetHpPercent(actor)

  const card = document.createElement("article")
  card.className = [
    "ffc-card",
    ready ? "is-ready" : "",
    targeted ? "is-targeted" : "",
    combatant.isDefeated ? "is-defeated" : "",
    isCurrent ? "is-current" : "",
  ]
    .filter(Boolean)
    .join(" ")

  card.dataset.actorId = actor.id
  card.dataset.combatantId = combatant.id

  const portraitButton = document.createElement("button")
  portraitButton.type = "button"
  portraitButton.className = "ffc-portrait-button"
  portraitButton.dataset.action = "toggle-ready"
  portraitButton.disabled = !canToggleReady

  const hpFill = document.createElement("div")
  hpFill.className = "ffc-hp-fill"
  hpFill.style.height = `${hpPercent}%`

  const turnOrder = document.createElement("div")
  turnOrder.className = "ffc-turn-order"
  turnOrder.textContent = `${getCombatantDisplayOrder(combatant)}`

  const img = document.createElement("img")
  img.className = "ffc-portrait-image"
  img.src = actor.img || combatant.img || "icons/svg/mystery-man.svg"
  img.alt = combatant.name

  const name = document.createElement("div")
  name.className = "ffc-name"
  name.textContent = combatant.name

  const readyMark = document.createElement("div")
  readyMark.className = "ffc-ready-mark"
  readyMark.innerHTML = `<i class="fa-solid fa-check"></i>`

  const targetedMark = document.createElement("div")
  targetedMark.className = "ffc-targeted-mark"
  targetedMark.innerHTML = `<i class="fa-solid fa-swords fa-bounce"></i>`
  targetedMark.dataset.tooltip =
    "You are the target of an upcoming attack. This will happen before your action."
  targetedMark.dataset.tooltipDirection = "UP"

  portraitButton.appendChild(hpFill)
  portraitButton.appendChild(img)
  portraitButton.appendChild(turnOrder)
  portraitButton.appendChild(readyMark)
  portraitButton.appendChild(targetedMark)

  portraitButton.addEventListener("click", async ev => {
    ev.preventDefault()
    if (!canToggleReady) return
    await requestToggleReady(actor)
    playSound("check")
  })

  card.appendChild(portraitButton)
  card.appendChild(name)

  if (game.user.isGM) {
    const gmBar = document.createElement("div")
    gmBar.className = "ffc-gm-bar"

    const targetBtn = document.createElement("button")
    targetBtn.type = "button"
    targetBtn.className = `ffc-gm-target-btn ${targeted ? "is-targeted" : ""}`
    targetBtn.dataset.action = "toggle-targeted"
    targetBtn.title = targeted ? "Remove Targeted" : "Mark Targeted"
    targetBtn.innerHTML = `<i class="fa-solid fa-swords"></i>`

    targetBtn.addEventListener("click", async ev => {
      ev.preventDefault()
      ev.stopPropagation()
      await setActorTargeted(actor, !targeted, { manual: true })
    })

    gmBar.appendChild(targetBtn)
    card.appendChild(gmBar)
  }

  return card
}

async function requestToggleReady(actor) {
  if (!actor) return
  if (game.user.isGM || actor.canUserModify(game.user, "update")) {
    return setActorReady(actor, !isReady(actor))
  }

  game.socket.emit(`module.fatherfog-combat`, {
    type: "fatherfog-combat",
    action: SOCKET_ACTIONS.TOGGLE_READY,
    actorId: actor.id,
  })
}

async function requestSkip(actor) {
  if (!actor) {
    return
  }

  if (game.user.isGM) {
    const combat = getActiveCombat()

    if (!combat?.started) return
    return gmSkipCombatant(combat, actor)
  }

  game.socket.emit(`module.fatherfog-combat`, {
    type: "fatherfog-combat",
    action: SOCKET_ACTIONS.REQUEST_SKIP,
    actorId: actor.id,
    requesterUserId: game.user.id,
  })
}

async function setActorReady(actor, value) {
  if (!actor) return
  return actor.setFlag("fatherfog-combat", FLAG_KEYS.READY, !!value)
}

async function setActorTargeted(actor, value, { manual = false } = {}) {
  if (!actor) return

  return actor.update(
    {
      [`flags.fatherfog-combat.${FLAG_KEYS.TARGETED}`]: !!value,
    },
    {
      ["fatherfog-combat"]: {
        manualTargetToggle: manual,
      },
    },
  )
}

function isReady(actor) {
  return actor?.getFlag("fatherfog-combat", FLAG_KEYS.READY) === true
}

function isTargeted(actor) {
  return actor?.getFlag("fatherfog-combat", FLAG_KEYS.TARGETED) === true
}

async function clearCombatActorStates(combat, { reason = "clear" } = {}) {
  if (!combat || !game.user.isGM) return

  const actors = [
    ...new Set(
      getTrackedCombatants(combat)
        .map(c => c.actor)
        .filter(Boolean),
    ),
  ]
  if (!actors.length) return

  const updates = actors
    .map(actor => {
      const data = {}
      if (isReady(actor))
        data[`flags.fatherfog-combat.${FLAG_KEYS.READY}`] = false
      if (isTargeted(actor))
        data[`flags.fatherfog-combat.${FLAG_KEYS.TARGETED}`] = false
      return { actor, data }
    })
    .filter(entry => Object.keys(entry.data).length > 0)

  for (const { actor, data } of updates) {
    await actor.update(data, {
      ["fatherfog-combat"]: {
        clearReason: reason,
        manualTargetToggle: false,
      },
    })
  }
}

async function gmAdvanceRound() {
  const combat = getActiveCombat()
  if (!combat || !game.user.isGM) return
  await clearCombatActorStates(combat, { reason: "gm-next-round" })
  await combat.nextRound()
  await startTimerForCurrentCombatant(combat)
}

function showRoundStartFx(roundNumber) {
  notifyFx({
    title: "NEW ROUND",
    subtitle: `Round ${roundNumber || 1}`,
    disposition: "neutral",
    icon: "fa-solid fa-hourglass-start",
  })
  playSound("round")
}

function notifyFx({
  title = "NOTICE",
  subtitle = "",
  disposition = "neutral",
  icon = "fa-solid fa-sparkles",
  duration = game.settings.get("fatherfog-combat", "fxDuration") * 1_000,
} = {}) {
  ensureFxHost()

  const wrap = document.createElement("div")
  wrap.className = `ffc-fx ffc-${disposition}`

  const sweep = document.createElement("div")
  sweep.className = "ffc-fx-sweep"

  const content = document.createElement("div")
  content.className = "ffc-fx-content"
  content.innerHTML = `
    <div class="ffc-fx-icon"><i class="${icon}"></i></div>
    <div class="ffc-fx-text">
      <div class="ffc-fx-title">${title}</div>
      ${subtitle ? `<div class="ffc-fx-subtitle">${subtitle}</div>` : ""}
    </div>
  `

  const particleLayer = document.createElement("div")
  particleLayer.className = "ffc-fx-particles"

  for (let i = 0; i < 18; i++) {
    const p = document.createElement("span")
    p.className = "ffc-fx-particle"
    p.style.setProperty("--x", `${Math.random() * 100}%`)
    p.style.setProperty("--y", `${20 + Math.random() * 60}%`)
    p.style.setProperty("--dx", `${-40 + Math.random() * 80}px`)
    p.style.setProperty("--dy", `${-25 + Math.random() * 50}px`)
    p.style.setProperty("--delay", `${Math.random() * 180}ms`)
    p.style.setProperty("--scale", `${0.6 + Math.random() * 0.9}`)
    particleLayer.appendChild(p)
  }

  wrap.appendChild(sweep)
  wrap.appendChild(particleLayer)
  wrap.appendChild(content)
  fxHostEl.appendChild(wrap)

  setTimeout(
    () => {
      wrap.classList.add("is-leaving")
    },
    Math.max(200, duration - 220),
  )

  setTimeout(() => {
    wrap.remove()
  }, duration)

  return wrap
}

/* =========================
   TURN TIMER + BANNERS
========================= */

function getTurnTimer(combat = getActiveCombat()) {
  return combat?.getFlag(COMBAT_FLAG_SCOPE, COMBAT_FLAG_KEYS.TIMER) || null
}

async function setTurnTimer(combat, data) {
  if (!combat || !game.user.isGM) return
  await combat.setFlag(COMBAT_FLAG_SCOPE, COMBAT_FLAG_KEYS.TIMER, data)
}

async function clearTurnTimer(combat) {
  if (!combat || !game.user.isGM) return
  await combat.unsetFlag(COMBAT_FLAG_SCOPE, COMBAT_FLAG_KEYS.TIMER)
}

async function startTimerForCurrentCombatant(combat = getActiveCombat()) {
  if (!combat?.started || !game.user.isGM) return

  const current = getCurrentTrackedCombatant(combat)

  if (!current || isReady(current.actor)) {
    const advanced = await gmAdvanceToNextPendingCombatant(combat)
    if (!advanced) {
      await clearTurnTimer(combat)
    }
    return
  }

  const turnTime = game.settings.get("fatherfog-combat", "timer")
  await setTurnTimer(combat, {
    combatantId: current.id,
    actorId: current.actor?.id ?? null,
    startedAt: Date.now(),
    expiresAt: Date.now() + turnTime * 1000,
    durationMs: turnTime * 1000,
    remainingMs: turnTime * 1000,
    paused: false,
    round: combat.round ?? 1,
  })
}

async function maybeAdvanceAfterReadyChange(combat, actor) {
  const current = getCurrentTrackedCombatant(combat)
  if (!current?.actor || current.actor.id !== actor?.id) {
    if (!getPendingCombatants(combat).length) {
      await clearTurnTimer(combat)
    }
    return
  }

  if (!isReady(actor)) return

  const advanced = await gmAdvanceToNextPendingCombatant(combat)
  if (!advanced) {
    await clearTurnTimer(combat)
  }
}

async function gmHandleTimerExpired(combat, combatantId) {
  if (!combat?.started || !game.user.isGM) return

  const timer = getTurnTimer(combat)
  if (!timer?.combatantId || timer.combatantId !== combatantId) return

  const combatant = combat.combatants.get(combatantId)
  const actor = combatant?.actor
  if (!combatant || !actor) {
    await clearTurnTimer(combat)
    return
  }

  if (!isReady(actor)) {
    await setActorReady(actor, true)
  }

  const advanced = await gmAdvanceToNextPendingCombatant(combat)
  if (!advanced) {
    await clearTurnTimer(combat)
  }
}

async function gmAdvanceToNextPendingCombatant(combat = getActiveCombat()) {
  if (!combat?.started || !game.user.isGM) return false

  const turns = combat.turns ?? []
  if (!turns.length) return false

  const currentTurn = Number.isInteger(combat.turn) ? combat.turn : 0

  for (let i = currentTurn + 1; i < turns.length; i++) {
    const c = turns[i]
    if (!c?.actor?.hasPlayerOwner) continue
    if (c.isDefeated) continue
    if (isReady(c.actor)) continue

    await combat.update({ turn: i })
    return true
  }

  return false
}

async function gmSkipCombatant(combat, actor, requesterUserId = null) {
  if (!combat?.started || !game.user.isGM || !actor) {
    return
  }

  const current = getCurrentTrackedCombatant(combat)
  if (!current?.actor || current.actor.id !== actor.id) {
    return
  }

  const allowSkip = currentPlayerHasSkippableTargets(
    combat,
    current,
    requesterUserId,
  )

  if (!allowSkip) {
    return
  }

  const ordered = getTrackedCombatants(combat).filter(c => !c.isDefeated)
  const initiatives = ordered
    .map(c => Number(c.initiative))
    .filter(n => Number.isFinite(n))

  const lastInitiative = initiatives.length ? Math.min(...initiatives) : 0

  await current.update({
    initiative: lastInitiative - 1,
  })

  combat.setupTurns()
  const nextIndex = (combat.turns ?? []).findIndex(
    c =>
      c.id !== current.id &&
      c.actor?.hasPlayerOwner &&
      !c.isDefeated &&
      !isReady(c.actor),
  )

  if (nextIndex >= 0) {
    await combat.update({ turn: nextIndex })
    await startTimerForCurrentCombatant(combat)
  } else {
    await clearTurnTimer(combat)
  }

  queueRender()
}

function currentPlayerHasSkippableTargets(
  combat,
  currentCombatant,
  requesterUserId = game.user.id,
) {
  if (!combat?.started || !currentCombatant?.actor) {
    return false
  }

  const requester = game.users.get(requesterUserId)
  if (!requester) {
    return false
  }

  const ownedCombatActorIds = getRequesterOwnedCombatActorIds(
    combat,
    requesterUserId,
  )
  const currentRoundOrder = getCurrentRoundPendingOrder(combat)

  const rows = currentRoundOrder.map(c => ({
    id: c.id,
    name: c.name,
    actorId: c.actor?.id,
    actorName: c.actor?.name,
    isCurrent: c.id === currentCombatant.id,
    isDefeated: !!c.isDefeated,
    isReady: !!isReady(c.actor),
    ownedByRequesterInCombat: ownedCombatActorIds.has(c.actor?.id),
    requesterUserId,
    requesterUserName: requester.name,
  }))

  const result = currentRoundOrder.some(c => {
    if (c.id === currentCombatant.id) return false
    if (!c.actor || c.isDefeated || isReady(c.actor)) return false

    return !ownedCombatActorIds.has(c.actor.id)
  })

  return result
}

function updateTurnBanners() {
  const combat = getActiveCombat()
  if (!combat?.started) {
    hideTurnBanner()
    hideNextUpBanner()
    return
  }

  const pending = getPendingCombatants(combat)
  if (!pending.length) {
    hideTurnBanner()
    hideNextUpBanner()
    return
  }

  const timer = getTurnTimer(combat)
  const current = timer?.combatantId
    ? combat.combatants.get(timer.combatantId)
    : getCurrentTrackedCombatant(combat)

  if (!current?.actor || current.isDefeated || isReady(current.actor)) {
    hideTurnBanner()
  } else {
    renderTurnBanner(combat, current, timer)
  }

  const nextCombatant = getNextPendingCombatantThisRound(combat)
  if (!nextCombatant?.actor) {
    hideNextUpBanner()
  } else {
    renderNextUpBanner(combat, nextCombatant)
  }
}

function renderTurnBanner(combat, combatant, timer) {
  installTurnBanners()

  const isCurrentOwner = combatant.actor?.isOwner === true
  const showToThisClient = isCurrentOwner || game.user.isGM

  if (!showToThisClient) {
    hideTurnBanner()
    lastTurnBannerState = null
    return
  }

  const isPaused = timer?.paused === true

  const remaining = isPaused
    ? Math.max(0, Math.ceil((Number(timer?.remainingMs) || 0) / 1000))
    : timer?.expiresAt
      ? Math.max(0, Math.ceil((Number(timer.expiresAt) - Date.now()) / 1000))
      : game.settings.get("fatherfog-combat", "timer")

  turnBannerTimerTextEl.textContent = isPaused
    ? `⏸ ${remaining}`
    : `${remaining}`

  const canSkip =
    !game.user.isGM &&
    currentPlayerHasSkippableTargets(
      combat,
      combatant,
      game.user.id,
      "renderTurnBanner",
    )

  const nextState = {
    combatantId: combatant.id,
    actorId: combatant.actor?.id ?? null,
    remaining,
    canSkip,
    name: combatant.name,
  }

  const bodyHtml = `
    <div class="ffc-turn-name-line">State what <span>${combatant.name}</span> is doing?</div>
    <div class="ffc-turn-help-line">Click <span>${combatant.name}'s</span> portrait when done</div>
  `

  const bodyChanged =
    !lastTurnBannerState ||
    lastTurnBannerState.combatantId !== nextState.combatantId ||
    lastTurnBannerState.name !== nextState.name

  if (bodyChanged) {
    turnBannerBodyEl.innerHTML = bodyHtml
  }

  const skipChanged =
    !lastTurnBannerState ||
    lastTurnBannerState.canSkip !== nextState.canSkip ||
    lastTurnBannerState.combatantId !== nextState.combatantId

  if (skipChanged) {
    turnBannerSkipWrapEl.replaceChildren()

    if (canSkip) {
      const skipBtn = document.createElement("button")
      skipBtn.type = "button"
      skipBtn.className = "ffc-btn ffc-skip-btn"
      skipBtn.innerHTML = `<i class="fa-solid fa-forward"></i><span>Skip</span>`
      skipBtn.addEventListener("pointerdown", ev => {
        ev.preventDefault()
        ev.stopPropagation()
      })
      skipBtn.addEventListener("click", async ev => {
        ev.preventDefault()
        ev.stopPropagation()
        await requestSkip(combatant.actor)
      })
      turnBannerSkipWrapEl.appendChild(skipBtn)
    }
  }

  turnBannerEl.classList.remove("ffc-hidden")
  lastTurnBannerState = nextState
}

function hideTurnBanner() {
  if (!turnBannerEl) return
  turnBannerEl.classList.add("ffc-hidden")
  lastTurnBannerState = null
}

function renderNextUpBanner(combat, nextCombatant) {
  // 🔴 hard stop for GM
  if (game.user.isGM) {
    hideNextUpBanner()
    return
  }

  installTurnBanners()

  const showToThisClient = nextCombatant.actor?.isOwner === true
  if (!showToThisClient) {
    hideNextUpBanner()
    return
  }

  const nextState = {
    combatantId: nextCombatant.id,
    name: nextCombatant.name,
  }

  const changed =
    !lastNextUpBannerState ||
    lastNextUpBannerState.combatantId !== nextState.combatantId ||
    lastNextUpBannerState.name !== nextState.name

  if (changed) {
    nextUpBannerEl.innerHTML = `
      <div class="ffc-nextup-inner">
        <div class="ffc-nextup-title">You're turn is next.</div>
        <div class="ffc-nextup-subtitle">Consider what <span>${nextCombatant.name}</span> will do?</div>
      </div>
    `
  }

  nextUpBannerEl.classList.remove("ffc-hidden")
  lastNextUpBannerState = nextState
}

function hideNextUpBanner() {
  if (!nextUpBannerEl) return
  nextUpBannerEl.classList.add("ffc-hidden")
  lastNextUpBannerState = null
}

function getCombatantDisplayOrder(combatant, combat = getActiveCombat()) {
  if (!combatant || !combat) return "?"
  const ordered = getTrackedCombatants(combat).filter(c => !c.isDefeated)
  const index = ordered.findIndex(c => c.id === combatant.id)
  return index >= 0 ? index + 1 : "?"
}

function getRequesterOwnedCombatActorIds(
  combat,
  requesterUserId = game.user.id,
) {
  if (!combat) return new Set()

  const requester = game.users.get(requesterUserId)
  if (!requester) return new Set()

  return new Set(
    getTrackedCombatants(combat)
      .filter(c =>
        c?.actor?.testUserPermission(
          requester,
          CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        ),
      )
      .map(c => c.actor.id),
  )
}

function getNetHpPercent(actor) {
  let value, max
  if (game.system.id === "mosh") {
    value = Number(actor?.system?.netHP?.value ?? 0)
    max = Number(actor?.system?.netHP?.max ?? 0)
  } else if (game.system.id === "liminal-horror") {
    value = Number(actor?.system?.defense?.hp ?? 0)
    max = Number(actor?.system?.defense?.hpMax ?? 0)
  } else {
    console.error("Fatherfog-combat | system is not supported", game.system.id)
    value = 0
    max = 0
  }
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.max(0, Math.min(100, (1 - value / max) * 100))
}
