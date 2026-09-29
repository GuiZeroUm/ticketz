// The React host sends authenticated requests; credentials never enter this frame.
export function createLiveRun(
  messages,
  conversationId,
  { onStep, onComplete, onError, onCancel, labels = {}, timeout = 185000 } = {}
) {
  const requestId = crypto.randomUUID();
  let state = "working";
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener("message", receive);
  };
  const fail = error => {
    if (state !== "working") return;
    state = "failed";
    cleanup();
    onError?.(error);
  };
  function receive(event) {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.type !== "agent-preview-chat-response" ||
      event.data.requestId !== requestId
    )
      return;
    if (state !== "working") return;
    if (event.data.error) {
      fail(event.data.error);
      return;
    }
    if (typeof event.data.reply !== "string" || !event.data.reply.trim()) {
      fail({ code: "ERR_HERMES_EMPTY_REPLY", message: labels.error });
      return;
    }
    state = "completed";
    cleanup();
    onComplete?.({
      kind: "live",
      title: "",
      paragraphs: [event.data.reply],
      footer: labels.connected || ""
    });
  }
  window.addEventListener("message", receive);
  timer = setTimeout(() => {
    parent.postMessage(
      { type: "agent-preview-chat-cancel", requestId },
      location.origin
    );
    fail({ code: "ERR_HERMES_TIMEOUT", message: labels.timeout });
  }, timeout);
  onStep?.(labels.progress);
  parent.postMessage(
    { type: "agent-preview-chat-request", requestId, messages, conversationId },
    location.origin
  );
  return {
    get state() {
      return state;
    },
    cancel() {
      if (state !== "working") return;
      state = "cancelled";
      cleanup();
      parent.postMessage(
        { type: "agent-preview-chat-cancel", requestId },
        location.origin
      );
      onCancel?.();
    }
  };
}
