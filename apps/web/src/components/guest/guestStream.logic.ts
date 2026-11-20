import {
  GUEST_ATTACHMENT_ROUTE,
  GUEST_MEDIA_ROUTE,
  GUEST_MESSAGE_MAX_ATTACHMENT_BYTES,
  GUEST_MESSAGE_MAX_ATTACHMENTS,
  GUEST_SHARE_PARAM,
  GuestStreamEvent,
  isProviderSendTurnSupportedImageMimeType,
  type GuestMessageId,
  type GuestShareView,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2ThreadHistoryPage,
  type OrchestrationV2TurnItem,
  type ThreadGuestMessage,
} from "@t3tools/contracts";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";
import {
  EMPTY_THREAD_HISTORY_META,
  applyHistoryPageMeta,
  type ThreadHistoryMeta,
} from "@t3tools/client-runtime/state/thread-history-merge";
import {
  applyThreadHistoryPage,
  applyThreadStreamItem,
  initialThreadStreamState,
  type ThreadStreamState,
} from "@t3tools/client-runtime/state/thread-stream";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export interface GuestStreamState extends ThreadStreamState {
  readonly view: GuestShareView | null;
  readonly history: ThreadHistoryMeta;
  readonly historyGeneration: number;
  readonly ended: boolean;
  /**
   * Messages this page saw waiting that have no transcript row yet. Survives reconnects, and a
   * message leaves once its row arrives, so a later bounded snapshot cannot bring it back.
   */
  readonly awaitingRowIds: ReadonlySet<GuestMessageId>;
}

export const initialGuestStreamState: GuestStreamState = {
  ...initialThreadStreamState,
  view: null,
  history: EMPTY_THREAD_HISTORY_META,
  historyGeneration: 0,
  ended: false,
  awaitingRowIds: new Set(),
};

const guestMessageIdOf = (item: OrchestrationV2TurnItem) =>
  item.type === "user_message" ? item.context?.guest?.guestMessageId : undefined;

function withPendingFrom(
  awaiting: ReadonlySet<GuestMessageId>,
  view: GuestShareView,
): ReadonlySet<GuestMessageId> {
  const pending = view.messages.filter((message) => message.status === "pending");
  if (pending.every((message) => awaiting.has(message.id))) return awaiting;
  return new Set([...awaiting, ...pending.map((message) => message.id)]);
}

function withoutPlaced(
  awaiting: ReadonlySet<GuestMessageId>,
  items: ReadonlyArray<OrchestrationV2TurnItem>,
): ReadonlySet<GuestMessageId> {
  const placed = items.flatMap((item) => {
    const id = guestMessageIdOf(item);
    return id !== undefined && awaiting.has(id) ? [id] : [];
  });
  if (placed.length === 0) return awaiting;
  const next = new Set(awaiting);
  for (const id of placed) next.delete(id);
  return next;
}

const decodeGuestStreamEvent = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.toCodecJson(GuestStreamEvent)),
);

/** Returns null for anything the server would never send, so a bad frame is skipped, not fatal. */
export const parseGuestStreamEvent = (data: string): GuestStreamEvent | null =>
  Option.getOrNull(decodeGuestStreamEvent(data));

export type GuestStreamAction =
  | GuestStreamEvent
  | ({ readonly cursor: string; readonly generation: number } & (
      | { readonly type: "history-start" }
      | { readonly type: "history-page"; readonly page: OrchestrationV2ThreadHistoryPage }
      | { readonly type: "history-error"; readonly error: string }
    ));

/**
 * Applies the share's stream: its thread items go through the reducer every stream-only view of a
 * thread shares, and the share's own state is tracked beside it.
 */
export function applyGuestStreamEvent(
  state: GuestStreamState,
  event: GuestStreamAction,
): GuestStreamState {
  if (
    event.type === "history-start" ||
    event.type === "history-page" ||
    event.type === "history-error"
  ) {
    if (
      state.ended ||
      state.projection === null ||
      event.cursor !== state.history.historyCursor ||
      event.generation !== state.historyGeneration
    )
      return state;
    if (event.type === "history-start")
      return { ...state, history: { ...state.history, loading: true, error: null } };
    if (event.type === "history-error")
      return { ...state, history: { ...state.history, loading: false, error: event.error } };
    return {
      ...state,
      ...applyThreadHistoryPage(state, event.cursor, event.page),
      history: applyHistoryPageMeta(state.history, event.page),
      awaitingRowIds: withoutPlaced(
        state.awaitingRowIds,
        event.page.items.map((row) => row.item),
      ),
    };
  }
  switch (event.type) {
    case "view":
      // The page follows the share it names; a view of another one means the link changed.
      if (state.view !== null && state.view.shareId !== event.view.shareId) {
        return { ...state, ended: true };
      }
      return {
        ...state,
        view: event.view,
        awaitingRowIds: withPendingFrom(state.awaitingRowIds, event.view),
      };
    case "thread": {
      const next = applyThreadStreamItem(state, event.item);
      if (next === state) return state;
      const placed =
        event.item.kind === "snapshot"
          ? (next.projection?.visibleTurnItems.map((row) => row.item) ?? [])
          : event.item.kind === "event" && event.item.event.type === "turn-item.updated"
            ? [event.item.event.payload]
            : [];
      return {
        ...state,
        ...next,
        ...(event.item.kind === "snapshot"
          ? {
              historyGeneration: state.historyGeneration + 1,
              history: {
                ...EMPTY_THREAD_HISTORY_META,
                historyCursor: next.historyCursor,
                hasMoreHistory: event.item.hasMoreHistory === true,
                latestLocalTurnOrdinal: event.item.latestLocalTurnOrdinal ?? null,
              },
            }
          : {}),
        awaitingRowIds: withoutPlaced(state.awaitingRowIds, placed),
      };
    }
    case "ended":
      return { ...state, ended: true };
  }
}

/**
 * The guest's messages to show after the transcript, oldest first. Pending ones always show. A
 * sent or dismissed one shows only while it awaits a row (see `awaitingRowIds`): a queued send, or
 * a dismissal to report. The transcript is a bounded window, so any other resolved message is old
 * history, not something to place at the end.
 */
export function unplacedGuestMessages(
  messages: ReadonlyArray<ThreadGuestMessage>,
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
  awaitingRowIds: ReadonlySet<GuestMessageId>,
): ReadonlyArray<ThreadGuestMessage> {
  const placed = new Set(items.flatMap((row) => guestMessageIdOf(row.item) ?? []));
  return messages
    .filter(
      (message) =>
        !placed.has(message.id) && (message.status === "pending" || awaitingRowIds.has(message.id)),
    )
    .toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** "23h left" or "5m left", rounded down, for the guest page header. */
export function formatGuestExpiry(
  expiresAt: string,
  nowMs: number,
  resolve: MessageResolver = m,
): string {
  const minutes = Math.floor((Date.parse(expiresAt) - nowMs) / 60_000);
  if (minutes <= 0) return resolve(msg("Expired"));
  return minutes >= 60
    ? resolve(msg("{hours}h left", { hours: Math.floor(minutes / 60) }))
    : resolve(msg("{minutes}m left", { minutes }));
}

/**
 * The share an invite (`<shareId>.<signature>`) opens. Only used to name the share in the page
 * URL and to find this browser's session for it; the server checks the signature.
 */
export function inviteShareId(credential: string): string | null {
  const [shareId, signature] = credential.split(".");
  return shareId && signature ? shareId : null;
}

/** Where the guest page loads a file of the shared thread or of a waiting message. */
export const guestAttachmentUrl = (shareId: string, attachmentId: string) =>
  `${GUEST_ATTACHMENT_ROUTE}?${GUEST_SHARE_PARAM}=${encodeURIComponent(shareId)}&id=${encodeURIComponent(attachmentId)}`;

/** Where the guest page loads an image file on the host that an agent message embeds. */
export const guestMediaUrl = (shareId: string, path: string) =>
  `${GUEST_MEDIA_ROUTE}?${GUEST_SHARE_PARAM}=${encodeURIComponent(shareId)}&path=${encodeURIComponent(path)}`;

/**
 * Why these files cannot go with one message, or null. The server checks the same limits; this
 * only says so before the upload.
 */
export function guestFilesProblem(
  files: ReadonlyArray<Pick<File, "type" | "size">>,
  resolve: MessageResolver = m,
): string | null {
  if (files.length > GUEST_MESSAGE_MAX_ATTACHMENTS) {
    return resolve(
      msg("Attach up to {count} files to a message.", { count: GUEST_MESSAGE_MAX_ATTACHMENTS }),
    );
  }
  if (files.reduce((total, file) => total + file.size, 0) > GUEST_MESSAGE_MAX_ATTACHMENT_BYTES) {
    return resolve(msg("Attached files can total up to 10 MB per message."));
  }
  const unsupported = files.some(
    (file) =>
      file.size === 0 ||
      (file.type.toLowerCase().startsWith("image/") &&
        !isProviderSendTurnSupportedImageMimeType(file.type)),
  );
  return unsupported
    ? resolve(msg("This file cannot be attached. Images must be PNG, JPEG, GIF, or WebP."))
    : null;
}

/**
 * Image URLs for the thread's messages, which the timeline shows as previews. The map keeps its
 * identity while the rows do, because the timeline rebuilds its entries when it changes.
 */
export function createGuestAttachmentUrls(shareId: string) {
  let previousItems: ReadonlyArray<OrchestrationV2ProjectedTurnItem> | null = null;
  let previous: ReadonlyMap<string, string> = new Map();
  return (items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>): ReadonlyMap<string, string> => {
    if (items === previousItems) return previous;
    previousItems = items;
    previous = new Map(
      items.flatMap(({ item }) =>
        item.type === "user_message"
          ? item.attachments.map(
              (attachment) => [attachment.id, guestAttachmentUrl(shareId, attachment.id)] as const,
            )
          : [],
      ),
    );
    return previous;
  };
}
