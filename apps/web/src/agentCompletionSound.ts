import { resolveSidebarThreadStatus, type SidebarThreadStatus } from "./components/Sidebar.logic";
import type { SidebarThreadSummary } from "./types";

export type AgentCompletionThreadSnapshot = Pick<
  SidebarThreadSummary,
  | "environmentId"
  | "id"
  | "latestTurn"
  | "session"
  | "backgroundLiveness"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
>;

export interface AgentCompletionSnapshotEntry {
  readonly status: SidebarThreadStatus;
  readonly completed: boolean;
}

export type AgentCompletionSnapshot = ReadonlyMap<string, AgentCompletionSnapshotEntry>;

export function collectAgentCompletionSnapshot(
  threads: ReadonlyArray<AgentCompletionThreadSnapshot>,
): AgentCompletionSnapshot {
  const snapshot = new Map<string, AgentCompletionSnapshotEntry>();
  for (const thread of threads) {
    snapshot.set(`${thread.environmentId}\u0000${thread.id}`, {
      status: resolveSidebarThreadStatus(thread),
      completed: thread.latestTurn?.state === "completed" && thread.latestTurn.completedAt !== null,
    });
  }
  return snapshot;
}

export function hasNewAgentCompletion(
  previous: AgentCompletionSnapshot,
  next: AgentCompletionSnapshot,
): boolean {
  for (const [threadKey, entry] of next) {
    // A turn can complete while the session or its background agents still work.
    // Only the same status transition shown by the sidebar should make a sound.
    if (
      previous.get(threadKey)?.status === "working" &&
      entry.status === "ready" &&
      entry.completed
    ) {
      return true;
    }
  }
  return false;
}

type AudioContextConstructor = typeof AudioContext;
type BrowserAudioWindow = Window &
  typeof globalThis & {
    readonly webkitAudioContext?: AudioContextConstructor;
  };

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (sharedAudioContext !== null && sharedAudioContext.state !== "closed") {
    return sharedAudioContext;
  }

  const audioWindow = window as BrowserAudioWindow;
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  sharedAudioContext = new AudioContextCtor();
  return sharedAudioContext;
}

export function primeAgentCompletionSound(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

export function playAgentCompletionSound(): void {
  const context = getAudioContext();
  if (context === null || context.state === "closed") {
    return;
  }

  const play = () => {
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      oscillator.frequency.setValueAtTime(740, now + 0.13);
      oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.22);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.48, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.38);
      oscillator.addEventListener(
        "ended",
        () => {
          oscillator.disconnect();
          gain.disconnect();
        },
        { once: true },
      );
    } catch {
      // Browser audio can be unavailable or blocked; notifications remain best-effort.
    }
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(play)
      .catch(() => undefined);
    return;
  }

  play();
}
