// The games of the arcade, in the order they are offered. The first is the one a new person
// starts with. Adding a game is adding its folder and its line here.
import type { GameDefinition } from '../core/game'
import { blip } from './blip/game'

export const GAMES: readonly [GameDefinition, ...GameDefinition[]] = [blip]
