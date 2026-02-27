/// <reference types="vite/client" />

declare module 'epubjs' {
  export default function ePub(data: ArrayBuffer | string): Book

  export interface Book {
    ready: Promise<void>
    loaded: {
      metadata: Promise<{ title: string; creator: string; description: string }>
      navigation: Promise<Navigation>
    }
    coverUrl(): Promise<string | null>
    renderTo(element: HTMLElement, options?: RenderOptions): Rendition
    destroy(): void
  }

  export interface Navigation {
    toc: NavItem[]
  }

  export interface NavItem {
    id: string
    href: string
    label: string
    subitems?: NavItem[]
  }

  export interface RenderOptions {
    width?: string | number
    height?: string | number
    spread?: string
    flow?: string
  }

  export interface Rendition {
    display(target?: string): Promise<void>
    prev(): Promise<void>
    next(): Promise<void>
    destroy(): void
    on(event: string, callback: (...args: unknown[]) => void): void
    off(event: string, callback: (...args: unknown[]) => void): void
    themes: Themes
    currentLocation(): unknown
  }

  export interface Themes {
    register(name: string, styles: Record<string, unknown>): void
    select(name: string): void
    fontSize(size: string): void
    default(styles: Record<string, unknown>): void
  }
}
