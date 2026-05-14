import type {
  EnvironmentId,
  OrchestrationEvent,
  OrchestrationLatestTurn,
  OrchestrationSession,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

import { isElectron } from "./env";
import { getServerConfig } from "./rpc/serverState";

const MAX_REMEMBERED_NOTIFICATIONS = 500;

type NotificationOutcome = "completed" | "failed";

interface ActiveAgentTurn {
  readonly turnId: TurnId;
  readonly title: string;
  readonly providerName: string | null;
}

export interface AgentBrowserNotificationState {
  readonly activeTurnsByThread: Map<string, ActiveAgentTurn>;
  readonly notifiedOutcomes: Map<string, number>;
}

export interface AgentThreadNotificationObservation {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly title: string | null;
  readonly session: OrchestrationSession | null;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}

export interface AgentBrowserNotificationDecision {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly outcome: NotificationOutcome;
  readonly title: string;
  readonly providerName: string | null;
}

type ThreadTitleResolver = (threadId: ThreadId) => string | null | undefined;

const globalNotificationState = createAgentBrowserNotificationState();

export function createAgentBrowserNotificationState(): AgentBrowserNotificationState {
  return {
    activeTurnsByThread: new Map(),
    notifiedOutcomes: new Map(),
  };
}

function threadKey(environmentId: EnvironmentId, threadId: ThreadId): string {
  return `${environmentId}\u0000${threadId}`;
}

function outcomeKey(
  environmentId: EnvironmentId,
  threadId: ThreadId,
  turnId: TurnId,
  outcome: NotificationOutcome,
): string {
  return `${threadKey(environmentId, threadId)}\u0000${turnId}\u0000${outcome}`;
}

function rememberNotifiedOutcome(state: AgentBrowserNotificationState, key: string): void {
  state.notifiedOutcomes.set(key, Date.now());
  if (state.notifiedOutcomes.size <= MAX_REMEMBERED_NOTIFICATIONS) {
    return;
  }

  const oldestKey = state.notifiedOutcomes.keys().next().value;
  if (oldestKey !== undefined) {
    state.notifiedOutcomes.delete(oldestKey);
  }
}

function isActiveSession(session: OrchestrationSession): boolean {
  return (session.status === "starting" || session.status === "running") && !!session.activeTurnId;
}

function terminalOutcomeForSession(session: OrchestrationSession): NotificationOutcome | null {
  if (session.status === "ready") {
    return "completed";
  }
  if (session.status === "error") {
    return "failed";
  }
  return null;
}

export function observeAgentThreadNotificationState(
  observation: AgentThreadNotificationObservation,
  state: AgentBrowserNotificationState,
): AgentBrowserNotificationDecision | null {
  const key = threadKey(observation.environmentId, observation.threadId);
  const session = observation.session;

  if (!session) {
    state.activeTurnsByThread.delete(key);
    return null;
  }

  const activeTurnId = session.activeTurnId;
  if (isActiveSession(session) && activeTurnId) {
    state.activeTurnsByThread.set(key, {
      turnId: activeTurnId,
      title: observation.title ?? "Agent thread",
      providerName: session.providerName,
    });
    return null;
  }

  const outcome = terminalOutcomeForSession(session);
  if (!outcome) {
    state.activeTurnsByThread.delete(key);
    return null;
  }

  const activeTurn = state.activeTurnsByThread.get(key);
  if (!activeTurn) {
    return null;
  }
  state.activeTurnsByThread.delete(key);

  const turnId = activeTurn.turnId;
  const notifiedKey = outcomeKey(observation.environmentId, observation.threadId, turnId, outcome);
  if (state.notifiedOutcomes.has(notifiedKey)) {
    return null;
  }
  rememberNotifiedOutcome(state, notifiedKey);

  return {
    environmentId: observation.environmentId,
    threadId: observation.threadId,
    turnId,
    outcome,
    title: observation.title ?? activeTurn.title,
    providerName: session.providerName ?? activeTurn.providerName,
  };
}

export function handleAgentBrowserNotificationShellSnapshot(
  snapshot: OrchestrationShellSnapshot,
  environmentId: EnvironmentId,
): void {
  for (const thread of snapshot.threads) {
    dispatchAgentBrowserNotificationDecision(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId: thread.id,
          title: thread.title,
          session: thread.session,
          latestTurn: thread.latestTurn,
        },
        globalNotificationState,
      ),
    );
  }
}

export function handleAgentBrowserNotificationShellEvent(
  event: OrchestrationShellStreamEvent,
  environmentId: EnvironmentId,
): void {
  if (event.kind !== "thread-upserted") {
    return;
  }

  dispatchAgentBrowserNotificationDecision(
    observeAgentThreadNotificationState(
      {
        environmentId,
        threadId: event.thread.id,
        title: event.thread.title,
        session: event.thread.session,
        latestTurn: event.thread.latestTurn,
      },
      globalNotificationState,
    ),
  );
}

export function handleAgentBrowserNotificationDomainEvents(
  events: ReadonlyArray<OrchestrationEvent>,
  environmentId: EnvironmentId,
  resolveTitle: ThreadTitleResolver,
): void {
  for (const event of events) {
    if (event.type !== "thread.session-set") {
      continue;
    }

    dispatchAgentBrowserNotificationDecision(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId: event.payload.threadId,
          title: resolveTitle(event.payload.threadId) ?? null,
          session: event.payload.session,
          latestTurn: null,
        },
        globalNotificationState,
      ),
    );
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | null> {
  if (!supportsBrowserNotifications()) {
    return null;
  }
  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  return Notification.requestPermission();
}

export function buildAgentThreadNotificationUrl(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): string {
  const path = `/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
  if (typeof window === "undefined") {
    return path;
  }
  if (isElectron) {
    return `${window.location.origin}${window.location.pathname}#${path}`;
  }

  return new URL(path, window.location.origin).toString();
}

function dispatchAgentBrowserNotificationDecision(
  decision: AgentBrowserNotificationDecision | null,
): void {
  if (!decision || !areAgentBrowserNotificationsEnabled()) {
    return;
  }

  void playAgentBrowserNotificationSound();
  showAgentBrowserNotification(decision);
}

function areAgentBrowserNotificationsEnabled(): boolean {
  return (
    getServerConfig()?.settings.enableDesktopNotifications ??
    DEFAULT_SERVER_SETTINGS.enableDesktopNotifications
  );
}

function supportsBrowserNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function showAgentBrowserNotification(decision: AgentBrowserNotificationDecision): void {
  showBrowserNotification({
    title: decision.outcome === "failed" ? "Agent run failed" : "Agent run finished",
    body: decision.providerName ? `${decision.title} (${decision.providerName})` : decision.title,
    tag: `t3-agent-${decision.environmentId}-${decision.threadId}-${decision.turnId}-${decision.outcome}`,
    url: buildAgentThreadNotificationUrl(decision.environmentId, decision.threadId),
  });
}

export async function sendTestAgentBrowserNotification(): Promise<NotificationPermission | null> {
  void playAgentBrowserNotificationSound();
  const permission = await requestBrowserNotificationPermission();
  if (permission !== "granted") {
    return permission;
  }

  showBrowserNotification({
    title: "T3 Code notification test",
    body: "Sound and browser notifications are working.",
    tag: "t3-agent-notification-test",
    url: typeof window === "undefined" ? "/" : window.location.href,
  });
  return permission;
}

function showBrowserNotification(input: {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: string;
}): void {
  if (!supportsBrowserNotifications() || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification(input.title, {
    body: input.body,
    tag: input.tag,
  });

  notification.addEventListener("click", () => {
    window.focus();
    notification.close();
    window.location.assign(input.url);
  });
}

async function playAgentBrowserNotificationSound(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    const audioContext = new AudioContextConstructor();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(784, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(988, startAt + 0.08);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.24);
    oscillator.addEventListener("ended", () => {
      void audioContext.close();
    });
  } catch {
    // Browsers may block audio until the user interacts with the page.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
