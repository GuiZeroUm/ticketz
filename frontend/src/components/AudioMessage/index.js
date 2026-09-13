import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";
import { useTheme } from "@material-ui/core/styles";
import { i18n } from "../../translate/i18n";
import "./audio.css";

let playingAudio = null;
export const audioTime = value => {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function Player({ src }) {
  const audio = useRef(null);
  const waveform = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  useEffect(() => {
    let disposed = false;
    let wave;
    let started = false;
    const media = audio.current;
    const start = async () => {
      if (started || disposed) return;
      started = true;
      try {
        const { default: WaveSurfer } = await import("wavesurfer.js");
        if (disposed) return;
        wave = WaveSurfer.create({
          container: waveform.current,
          media,
          url: src,
          height: 36,
          barWidth: 2,
          barGap: 3,
          barRadius: 2,
          waveColor: "#94a3b8",
          progressColor: primary,
          cursorWidth: 0,
          normalize: true
        });
        wave.on("error", () => {
          if (!disposed) setFallback(true);
        });
        // The constructor loads media.src asynchronously; loading again aborts it.
        wave.on("ready", () => {
          if (!disposed) setReady(true);
        });
      } catch (error) {
        if (!disposed) setFallback(true);
      }
    };
    // Decode only visible messages, not the whole loaded conversation history.
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
              observer.disconnect();
              start();
            }
          });
    if (observer) observer.observe(waveform.current);
    else start();
    return () => {
      disposed = true;
      observer?.disconnect();
      wave?.destroy();
      media.pause();
      if (playingAudio === media) playingAudio = null;
    };
  }, [src, primary]);

  const toggle = () => {
    if (playing) audio.current.pause();
    else audio.current.play().catch(() => setFallback(true));
  };

  return (
    <div className="voice-message" data-testid="voice-message">
      <audio
        ref={audio}
        src={src}
        preload="none"
        controls={fallback}
        aria-label={i18n.t("chatExperience.audio")}
        onLoadedMetadata={() => setDuration(audio.current.duration)}
        onDurationChange={() => setDuration(audio.current.duration)}
        onTimeUpdate={() => setTime(audio.current.currentTime)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onPlay={() => {
          if (playingAudio && playingAudio !== audio.current)
            playingAudio.pause();
          playingAudio = audio.current;
          setPlaying(true);
        }}
      />
      {!fallback && (
        <div className="voice-player">
          <button
            type="button"
            className="voice-play ew-button"
            onClick={toggle}
            aria-label={i18n.t(
              playing ? "chatExperience.pause" : "chatExperience.play"
            )}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="voice-track">
            <div ref={waveform} className="voice-wave" aria-hidden="true" />
            {!ready && (
              <span className="voice-loading">
                {i18n.t("chatExperience.loadingAudio")}
              </span>
            )}
            <input
              type="range"
              min="0"
              max={Number.isFinite(duration) ? duration : 0}
              step="0.1"
              value={time}
              disabled={!duration}
              aria-label={i18n.t("chatExperience.seek")}
              aria-valuetext={audioTime(time)}
              onChange={event => {
                audio.current.currentTime = Number(event.target.value);
                setTime(Number(event.target.value));
              }}
            />
            <div className="voice-meta">
              <span>
                <Mic size={11} />
                {audioTime(time)} / {audioTime(duration)}
              </span>
              <button
                type="button"
                aria-label={i18n.t("chatExperience.speed")}
                onClick={() => {
                  const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
                  audio.current.playbackRate = next;
                  setSpeed(next);
                }}
              >
                {speed}×
              </button>
            </div>
          </div>
        </div>
      )}
      {fallback && <small>{i18n.t("chatExperience.audioFallback")}</small>}
    </div>
  );
}

export default function AudioMessage({ src }) {
  return <Player key={src} src={src} />;
}
