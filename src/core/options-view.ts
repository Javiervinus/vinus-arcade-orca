// The window of the arcade's settings: each one a row to press. A switch is on or off; a choice
// goes to its next value. What a row says is read each time it is shown, so the rows follow the
// language when it changes.
import type { Strings } from './strings'

interface Row {
  label(): string
  /** What it does, for who hovers it. */
  hint?(): string
}

export interface Switch extends Row {
  get(): boolean
  set(value: boolean): void
}

export interface Choice extends Row {
  /** What is chosen now, as the row shows it. */
  value(): string
  /** Goes to the next thing to choose. */
  next(): void
}

export type Option = Switch | Choice

function isChoice(option: Option): option is Choice {
  return 'next' in option
}

interface Built {
  option: Option
  button: HTMLButtonElement
  label: HTMLSpanElement
  state: HTMLSpanElement
}

export class Options {
  private readonly rows: Built[] = []

  constructor(
    private readonly root: HTMLElement,
    list: HTMLElement,
    private readonly strings: Strings,
    options: readonly Option[]
  ) {
    for (const option of options) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'switch'
      if (!isChoice(option)) button.setAttribute('role', 'switch')
      const label = document.createElement('span')
      label.className = 'switch-label'
      const state = document.createElement('span')
      state.className = 'switch-state'
      button.append(label, state)
      button.addEventListener('click', () => {
        if (isChoice(option)) option.next()
        else option.set(!option.get())
        this.refresh()
      })
      this.rows.push({ option, button, label, state })
      list.append(button)
    }
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(): void {
    this.root.hidden = false
    this.refresh()
  }

  hide(): void {
    this.root.hidden = true
  }

  refresh(): void {
    for (const { option, button, label, state } of this.rows) {
      label.textContent = option.label()
      button.title = option.hint?.() ?? ''
      if (isChoice(option)) {
        state.textContent = option.value()
        continue
      }
      const on = option.get()
      button.setAttribute('aria-checked', String(on))
      state.textContent = on ? this.strings.on : this.strings.off
    }
  }
}
