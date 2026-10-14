type Listener<T> = (payload: T) => void;

/** Tiny typed event emitter (no dependencies, returns an unsubscribe function). */
export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((l) => (l as Listener<Events[K]>)(payload));
  }

  clear(): void {
    this.listeners.clear();
  }
}
