// The window of the arcade's settings: each one a switch to press.
import type { Strings } from './strings'

export interface Option {
  label: string
  /** What it does, for who hovers it. */
  hint?: string
  get(): boolean
  set(value: boolean): void
}

interface Row {
  option: Option
  button: HTMLButtonElement
  state: HTMLSpanElement
}

export class Options {
  private readonly rows: Row[] = []

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
      button.setAttribute('role', 'switch')
      if (option.hint) button.title = option.hint
      const label = document.createElement('span')
      label.className = 'switch-label'
      label.textContent = option.label
      const state = document.createElement('span')
      state.className = 'switch-state'
      button.append(label, state)
      button.addEventListener('click', () => {
        option.set(!option.get())
        this.refresh()
      })
      this.rows.push({ option, button, state })
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
    for (const { option, button, state } of this.rows) {
      const on = option.get()
      button.setAttribute('aria-checked', String(on))
      state.textContent = on ? this.strings.on : this.strings.off
    }
  }
}
