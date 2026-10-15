/** BroadcastChannel shared by all tabs of this origin for authentication signals. */
export const SESSION_CHANNEL_NAME = 'nimbus-auth';

/** The only message that is ever sent: it contains no token, user or session data. */
export const SESSION_ENDED_MESSAGE = { type: 'session_ended' } as const;

/*
 * One channel object per page for sending and receiving. A BroadcastChannel never receives its
 * own messages, so the tab that logs out does not react to its own signal.
 */
let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    try {
      channel =
        typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

function isSessionEndedMessage(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === SESSION_ENDED_MESSAGE.type
  );
}

/**
 * Tells the other tabs that the shared session has ended (logout in this tab).
 *
 * Every tab keeps its own access token in memory, and the Web Lock only serializes requests. The
 * shared refresh cookie is already gone, but another tab could otherwise keep showing protected
 * content and use its access token until it expires.
 */
export function broadcastSessionEnded(): void {
  try {
    getChannel()?.postMessage(SESSION_ENDED_MESSAGE);
  } catch {
    // Signalling other tabs is best effort and must never undo the logout in this tab.
  }
}

/** Calls `onSessionEnded` when another tab reports that the session has ended. */
export function subscribeToSessionEnded(onSessionEnded: () => void): () => void {
  const current = getChannel();

  if (!current) {
    return () => {};
  }

  const listener = (event: MessageEvent<unknown>) => {
    if (isSessionEndedMessage(event.data)) {
      onSessionEnded();
    }
  };

  current.addEventListener('message', listener);
  return () => current.removeEventListener('message', listener);
}

/** Test helper: closes the channel of this page so the next call opens a new one. */
export function resetSessionChannelForTests(): void {
  channel?.close();
  channel = undefined;
}
