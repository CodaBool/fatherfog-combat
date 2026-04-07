import { testSound } from "./audio.js"

export class FatherfogCombatAudioOverridesApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: `fatherfog-combat-audio-overrides`,
    tag: "form",
    window: {
      title: "Per-Player Audio Overrides",
      resizable: true,
    },
    position: {
      width: 900,
      height: "auto",
    },
    form: {
      handler: FatherfogCombatAudioOverridesApp.#onSubmit,
      closeOnSubmit: true,
    },
  }

  static PARTS = {
    content: {
      template: `modules/fatherfog-combat/templates/overrides.hbs`,
    },
    footer: {
      template: "templates/generic/form-footer.hbs",
    },
  }

  async _prepareContext() {
    const overrides = game.settings.get("fatherfog-combat", "audioOverrides") || {}

    const users = game.users.contents.map(user => {
      const userOverrides = overrides[user.id] || {}
      return {
        id: user.id,
        name: user.name,
        round: userOverrides.round || "",
        check: userOverrides.check || "",
        targetOn: userOverrides.targetOn || "",
        targetOff: userOverrides.targetOff || "",
      }
    })

    const buttons = [
      {
        type: "submit",
        action: "save",
        icon: "fa-solid fa-save",
        label: "Save",
      },
    ]

    return { users, buttons }
  }

  _onRender(context, options) {
    super._onRender(context, options)

    this.element.querySelectorAll("[data-action='pick-file']").forEach(btn => {
      btn.addEventListener("click", async ev => {
        ev.preventDefault()
        const inputName = ev.currentTarget.dataset.target
        const input = this.element.querySelector(`[name="${CSS.escape(inputName)}"]`)
        if (!input) return

        const fp = new FilePicker({
          type: "audio",
          current: input.value || "",
          callback: path => {
            input.value = path
          },
        })

        fp.render(true)
      })
    })

    this.element.querySelectorAll("[data-action='test-sound']").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault()
        const userId = ev.currentTarget.dataset.userId
        const soundType = ev.currentTarget.dataset.soundType
        const inputName = ev.currentTarget.dataset.target
        const input = this.element.querySelector(`[name="${CSS.escape(inputName)}"]`)
        if (!input) return

        const temp = input.value?.trim()
        if (temp) {
          const audio = new Audio(temp)
          const volume = Math.max(
            0,
            Math.min(1, Number(game.settings.get("fatherfog-combat", "volume") || 0) / 100),
          )
          audio.volume = volume
          audio.play().catch(() => {})
          return
        }

        testSound(soundType, userId)
      })
    })

    this.element.querySelectorAll("[data-action='clear-sound']").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault()
        const inputName = ev.currentTarget.dataset.target
        const input = this.element.querySelector(`[name="${CSS.escape(inputName)}"]`)
        if (!input) return
        input.value = ""
      })
    })
  }

  static async #onSubmit(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object)
    const users = expanded.users || {}
    const cleaned = {}

    for (const [userId, sounds] of Object.entries(users)) {
      cleaned[userId] = {
        round: (sounds.round || "").trim(),
        check: (sounds.check || "").trim(),
        targetOn: (sounds.targetOn || "").trim(),
        targetOff: (sounds.targetOff || "").trim(),
      }
    }

    await game.settings.set("fatherfog-combat", "audioOverrides", cleaned)
  }
}

globalThis.FatherfogCombatAudioOverridesApp = FatherfogCombatAudioOverridesApp
