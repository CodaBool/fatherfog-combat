"fatherfog-combat"import { playSound } from "./audio.js"

let trackerEl = null
let trackerBodyEl = null
let trackerRoundEl = null
let fxHostEl = null
let socketBound = false
let renderQueued = false

const SOCKET_ACTIONS = {
  TOGGLE_READY: "toggleReady",
  SET_TARGETED: "setTargeted",
  CLEAR_STATES: "clearStates",
}

const FLAG_KEYS = {
  READY: "ready",
  TARGETED: "targeted",
}

Hooks.once("init", () => {
  window.FatherfogCombatFX = {
    notify: notifyFx,
  }

  window.FatherfogCombat = {
    render: renderTracker,
    clearStates: () => clearCombatActorStates(getActiveCombat(), { reason: "manual-clear" }),
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
  }
})

Hooks.once("ready", () => {
  bindSocket()
  installTracker()
  registerHooks()
  renderTracker()
})

function registerHooks() {
  Hooks.on("combatStart", async combat => {
    if (game.user.isGM) {
      await clearCombatActorStates(combat, { reason: "combat-start" })
    }
    showRoundStartFx(combat?.round ?? 1)
    queueRender()
  })

  Hooks.on("deleteCombat", async combat => {
    if (game.user.isGM) {
      await clearCombatActorStates(combat, { reason: "combat-end" })
    }
    removeTracker()
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
      }
      showRoundStartFx(combat.round)
    }

    queueRender()
  })

  Hooks.on("updateActor", (actor, changed, options) => {
    const flagPath = `flags.fatherfog-combat`
    const changedFlags = foundry.utils.getProperty(changed, flagPath)
    if (!changedFlags) return

    const readyChanged = Object.prototype.hasOwnProperty.call(changedFlags, FLAG_KEYS.READY)
    const targetedChanged = Object.prototype.hasOwnProperty.call(changedFlags, FLAG_KEYS.TARGETED)

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

    if (readyChanged && actor.isOwner && !game.user.isGM) {
      // Optional local feedback for the owning player.
      // Kept intentionally subtle.
    }

    queueRender()
  })
}

function bindSocket() {
  if (socketBound) return
  socketBound = true

  game.socket.on(`module.fatherfog-combat`, async payload => {
    if (!game.user.isGM) return
    if (!payload || payload.type !== "fatherfog-combat") return

    const { action, actorId, value } = payload
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
      await clearCombatActorStates(getActiveCombat(), { reason: "socket-clear" })
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
  return combat.combatants.contents.filter(c => {
    const actor = c.actor
    if (!actor) return false
    if (!actor.hasPlayerOwner) return false
    return true
  })
}

function renderTracker() {
  const combat = getActiveCombat()

  if (!combat || !combat.started) {
    if (trackerEl) trackerEl.classList.add("ffc-hidden")
    return
  }

  installTracker()
  trackerEl.classList.remove("ffc-hidden")

  const showGm = game.user.isGM
  const nextRoundBtn = trackerEl.querySelector('[data-action="next-round"]')
  if (nextRoundBtn) nextRoundBtn.style.display = showGm ? "" : "none"

  trackerRoundEl.textContent = `Round ${combat.round || 1}`

  const width = Number(game.settings.get("fatherfog-combat", "portraitSize") || 156)
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

  const card = document.createElement("article")
  card.className = [
    "ffc-card",
    ready ? "is-ready" : "",
    targeted ? "is-targeted" : "",
    combatant.isDefeated ? "is-defeated" : "",
  ].filter(Boolean).join(" ")

  card.dataset.actorId = actor.id
  card.dataset.combatantId = combatant.id

  const portraitButton = document.createElement("button")
  portraitButton.type = "button"
  portraitButton.className = "ffc-portrait-button"
  portraitButton.dataset.action = "toggle-ready"
  portraitButton.disabled = !canToggleReady

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
  targetedMark.dataset.tooltip = "You are the target of an upcoming attack. This will happen before your action."
  targetedMark.dataset.tooltipDirection = "UP"

  portraitButton.appendChild(img)
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

  const actors = [...new Set(getTrackedCombatants(combat).map(c => c.actor).filter(Boolean))]
  if (!actors.length) return

  const updates = actors.map(actor => {
    const data = {}
    if (isReady(actor)) data[`flags.fatherfog-combat.${FLAG_KEYS.READY}`] = false
    if (isTargeted(actor)) data[`flags.fatherfog-combat.${FLAG_KEYS.TARGETED}`] = false
    return { actor, data }
  }).filter(entry => Object.keys(entry.data).length > 0)

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
  duration = Number(game.settings.get("fatherfog-combat", "fxDuration") || 1600),
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

  setTimeout(() => {
    wrap.classList.add("is-leaving")
  }, Math.max(200, duration - 220))

  setTimeout(() => {
    wrap.remove()
  }, duration)

  return wrap
}
