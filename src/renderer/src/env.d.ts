/// <reference types="vite/client" />

import type { SnippetyApi } from '../../shared/types.js'

declare global {
  interface Window {
    /** Most wystawiony przez preload - jedyne wejscie UI do systemu. */
    api: SnippetyApi
  }
}

export {}
