// The few Node APIs the worker and its tests use. They are declared here because the plugin has
// no build step and no dependencies, and Orca's own typings do not include Node's.
declare module 'node:fs/promises' {
  interface Dirent {
    name: string
    isDirectory(): boolean
    isFile(): boolean
  }
  interface Stats {
    size: number
    mtimeMs: number
  }
  export interface FileBytes {
    toString(encoding: 'base64'): string
  }
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  export function stat(path: string): Promise<Stats>
  export function readFile(path: string): Promise<FileBytes>
  export function mkdtemp(prefix: string): Promise<string>
  export function mkdir(path: string, options: { recursive: true }): Promise<string | undefined>
  export function writeFile(path: string, data: string): Promise<void>
  export function rm(path: string, options: { recursive: true; force: true }): Promise<void>
}

declare module 'node:crypto' {
  import type { FileBytes } from 'node:fs/promises'
  export function createHash(algorithm: 'sha256'): {
    update(data: FileBytes): { digest(encoding: 'hex'): string }
  }
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}

declare module 'node:os' {
  export function tmpdir(): string
}

declare module 'node:child_process' {
  export function execFile(
    file: string,
    args: readonly string[],
    options: { timeout: number; maxBuffer: number },
    callback: (error: Error | null, stdout: string) => void
  ): void
}

/** The worker's process. Orca runs it inside the app, whose resources hold the `orca` CLI. */
declare const process: { resourcesPath?: string }
