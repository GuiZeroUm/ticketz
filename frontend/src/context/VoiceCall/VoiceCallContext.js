import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from "@material-ui/core";
import { CallEnd, Mic, MicOff, Phone, PhoneDisabled } from "@material-ui/icons";
import { toast } from "react-toastify";
import api from "../../services/api";
import { SocketContext } from "../Socket/SocketContext";
import { openVoiceWebRTC } from "../../helpers/voiceWebRTC";
import { validVoiceCallId } from "../../helpers/voiceCallId";
import { i18n } from "../../translate/i18n";

export const VoiceCallContext = createContext({});

const startRinging = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return () => {};
  let context;
  try {
    context = new AudioContextClass();
  } catch {
    return () => {};
  }
  let stopped = false;
  const ring = () => {
    if (stopped) return;
    [440, 480].forEach(frequency => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.12;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.8);
    });
  };
  ring();
  const interval = setInterval(ring, 3000);
  return () => {
    stopped = true;
    clearInterval(interval);
    context.close().catch(() => {});
  };
};

export function VoiceCallProvider({ children }) {
  const socketManager = useContext(SocketContext);
  const [incoming, setIncoming] = useState(null);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef(null);
  const activeIdRef = useRef(null);

  const closeMedia = useCallback(() => {
    mediaRef.current?.close();
    mediaRef.current = null;
    activeIdRef.current = null;
    setActive(null);
    setMuted(false);
  }, []);

  useEffect(() => {
    if (!incoming) return undefined;
    return startRinging();
  }, [incoming]);

  useEffect(() => {
    if (!active?.acceptedAt) {
      setElapsed(0);
      return undefined;
    }
    const update = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(active.acceptedAt).getTime()) / 1000
          )
        )
      );
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [active]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    if (!companyId) return undefined;
    const socket = socketManager.GetSocket(companyId);
    const onIncoming = call => {
      if (validVoiceCallId(call?.id)) setIncoming(call);
    };
    const onUpdated = call => {
      if (!validVoiceCallId(call?.id)) return;
      if (call.state === "accepted") {
        setIncoming(current => (current?.id === call.id ? null : current));
      }
      setActive(current =>
        current?.id === call.id ? { ...current, ...call } : current
      );
    };
    const onEnded = call => {
      if (!validVoiceCallId(call?.id)) return;
      setIncoming(current => (current?.id === call.id ? null : current));
      if (activeIdRef.current === call.id) closeMedia();
    };
    socket.on("voice:incoming", onIncoming);
    socket.on("voice:updated", onUpdated);
    socket.on("voice:ended", onEnded);
    return () => {
      socket.off("voice:incoming", onIncoming);
      socket.off("voice:updated", onUpdated);
      socket.off("voice:ended", onEnded);
      closeMedia();
    };
  }, [closeMedia, socketManager]);

  const reject = async () => {
    if (!incoming) return;
    const callId = validVoiceCallId(incoming.id);
    if (!callId) {
      setIncoming(null);
      toast.error(i18n.t("voiceCalls.errors.action"));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/voice/calls/${callId}/reject`);
      setIncoming(null);
    } catch (error) {
      if (error.response?.status === 409) setIncoming(null);
      else toast.error(i18n.t("voiceCalls.errors.action"));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!incoming) return;
    const call = incoming;
    const callId = validVoiceCallId(call.id);
    if (!callId) {
      setIncoming(null);
      toast.error(i18n.t("voiceCalls.errors.action"));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/voice/calls/${callId}/accept`);
      setIncoming(null);
      const media = await openVoiceWebRTC(callId, data.mediaToken);
      mediaRef.current = media;
      activeIdRef.current = callId;
      setActive({ ...data.call, id: callId });
    } catch (error) {
      if (error.response?.status === 409) {
        setIncoming(null);
      } else if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        await api.post(`/voice/calls/${callId}/end`).catch(() => {});
        toast.error(i18n.t("voiceCalls.errors.microphone"));
      } else {
        await api.post(`/voice/calls/${callId}/end`).catch(() => {});
        toast.error(i18n.t("voiceCalls.errors.action"));
      }
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!active) return;
    const callId = validVoiceCallId(active.id);
    if (!callId) {
      closeMedia();
      toast.error(i18n.t("voiceCalls.errors.action"));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/voice/calls/${callId}/end`);
    } catch {
      toast.error(i18n.t("voiceCalls.errors.action"));
    } finally {
      closeMedia();
      setBusy(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    mediaRef.current?.setMuted(next);
    setMuted(next);
  };

  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60
  ).padStart(2, "0")}`;

  return (
    <VoiceCallContext.Provider value={{ incoming, active }}>
      {children}
      <Dialog
        open={Boolean(incoming)}
        maxWidth="xs"
        fullWidth
        disableBackdropClick
      >
        <DialogTitle>{i18n.t("voiceCalls.incoming")}</DialogTitle>
        <DialogContent>
          <Typography variant="h6">{incoming?.number || "-"}</Typography>
          <Typography color="textSecondary">
            {i18n.t("voiceCalls.incomingHint")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={reject}
            color="secondary"
            disabled={busy}
            startIcon={<PhoneDisabled />}
          >
            {i18n.t("voiceCalls.reject")}
          </Button>
          <Button
            onClick={accept}
            color="primary"
            variant="contained"
            disabled={busy}
            startIcon={<Phone />}
          >
            {i18n.t("voiceCalls.accept")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(active)}
        maxWidth="xs"
        fullWidth
        disableBackdropClick
      >
        <DialogTitle>{i18n.t("voiceCalls.active")}</DialogTitle>
        <DialogContent>
          <Typography variant="h6">{active?.number || "-"}</Typography>
          <Typography color="textSecondary">{duration}</Typography>
        </DialogContent>
        <DialogActions>
          <IconButton
            onClick={toggleMute}
            aria-label={i18n.t("voiceCalls.mute")}
          >
            {muted ? <MicOff /> : <Mic />}
          </IconButton>
          <Button
            onClick={end}
            color="secondary"
            variant="contained"
            disabled={busy}
            startIcon={<CallEnd />}
          >
            {i18n.t("voiceCalls.end")}
          </Button>
        </DialogActions>
      </Dialog>
    </VoiceCallContext.Provider>
  );
}
