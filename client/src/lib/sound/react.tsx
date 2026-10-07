// React bindings: <SoundProvider> (makes sure the page's engine exists) and useSound(name) (a stable play function).
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getSoundEngine, type SoundEngine } from './engine';

const Ctx = createContext<SoundEngine | null>(null);
export function SoundProvider({ children }: { children: ReactNode }){
  const engine = useMemo(() => getSoundEngine(), []);
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}
function useEngine(){ return useContext(Ctx) || getSoundEngine(); }
/** play(name) for one event; respects the visitor's on/off, the portal settings and the event's gap */
export function useSound(name: string){
  const engine = useEngine();
  return useCallback((opts?: { force?: boolean; rate?: number; volume?: number }) => engine.play(name, opts), [engine, name]);
}
/** the visitor's sound state, re-rendering when it changes */
export function useSoundState(){
  const engine = useEngine();
  const enabled = useSyncExternalStore(cb => engine.onChange(cb), () => engine.enabled, () => false);
  const volume = useSyncExternalStore(cb => engine.onChange(cb), () => engine.user.volume, () => 0.05);
  return { enabled, volume, setEnabled: (on: boolean) => engine.setEnabled(on), setVolume: (v: number) => engine.setVolume(v), engine };
}
