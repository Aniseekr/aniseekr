type Listener = () => void;

const hiddenReasons = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function isFloatingTabBarHidden(): boolean {
  return hiddenReasons.size > 0;
}

export function subscribeFloatingTabBarVisibility(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setFloatingTabBarHidden(reason: string, hidden: boolean): void {
  const wasHidden = isFloatingTabBarHidden();
  if (hidden) {
    hiddenReasons.add(reason);
  } else {
    hiddenReasons.delete(reason);
  }
  if (wasHidden !== isFloatingTabBarHidden()) {
    emit();
  }
}

export function __resetFloatingTabBarVisibilityForTests(): void {
  hiddenReasons.clear();
  listeners.clear();
}
