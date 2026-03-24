export const CHATDOWN_OPEN_OVERLAY_EVENT = 'chatdown:open-overlay';
export const CHATDOWN_SHOW_ERROR_EVENT = 'chatdown:show-error';
export const CHATDOWN_VISIBILITY_CHANGE_EVENT = 'chatdown:visibility-change';

export interface ChatdownErrorDetail {
  message: string;
}

export interface ChatdownVisibilityDetail {
  visible: boolean;
}

export const chatdownEvents = new EventTarget();

export function openChatdownOverlay(): void {
  chatdownEvents.dispatchEvent(new Event(CHATDOWN_OPEN_OVERLAY_EVENT));
}

export function showChatdownError(message: string): void {
  chatdownEvents.dispatchEvent(
    new CustomEvent<ChatdownErrorDetail>(CHATDOWN_SHOW_ERROR_EVENT, {
      detail: { message },
    })
  );
}

export function emitChatdownVisibilityChange(visible: boolean): void {
  chatdownEvents.dispatchEvent(
    new CustomEvent<ChatdownVisibilityDetail>(CHATDOWN_VISIBILITY_CHANGE_EVENT, {
      detail: { visible },
    })
  );
}
