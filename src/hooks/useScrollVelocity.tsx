import { createContext, useContext, useRef, type ReactNode } from 'react'
import { ReactLenis, useLenis } from 'lenis/react'

interface ScrollState {
  velocity: React.RefObject<number>
  progress: React.RefObject<number>
}

const ScrollContext = createContext<ScrollState>({
  velocity: { current: 0 } as React.RefObject<number>,
  progress: { current: 0 } as React.RefObject<number>,
})

function ScrollBridge({ state }: { state: ScrollState }) {
  useLenis((lenis) => {
    ;(state.velocity as React.MutableRefObject<number>).current = lenis.velocity
    ;(state.progress as React.MutableRefObject<number>).current =
      lenis.limit > 0 ? lenis.scroll / lenis.limit : 0
  })
  return null
}

export function ScrollProvider({ children }: { children: ReactNode }) {
  const velocity = useRef(0)
  const progress = useRef(0)
  const state = useRef<ScrollState>({ velocity, progress }).current

  return (
    <ReactLenis root options={{ duration: 1.2, smoothWheel: true, autoRaf: true }}>
      <ScrollBridge state={state} />
      <ScrollContext.Provider value={state}>
        {children}
      </ScrollContext.Provider>
    </ReactLenis>
  )
}

export function useScrollVelocity() {
  return useContext(ScrollContext).velocity
}

export function useScrollProgress() {
  return useContext(ScrollContext).progress
}
