import React, { useState } from "react";
import { motion } from "framer-motion";
import { useMediaQuery, useTheme } from "@material-ui/core";
import { i18n } from "../../translate/i18n";
import { getBackendURL } from "../../services/config";
import BackgroundPaths from "./BackgroundPaths";
import "./login.css";

export const publicBrandAsset = filename =>
  filename ? `${getBackendURL()}/public/${filename}` : "";

export function BrandLogo({ logo, name = "Espaço Whats", compact = false }) {
  const [failed, setFailed] = useState("");
  const custom = logo && failed !== logo;
  return (
    <div
      className={`login-brand-logo${compact ? " login-brand-logo--compact" : ""}`}
    >
      <img
        src={custom ? logo : "/branding/espaco-whats.png"}
        alt={custom ? name : ""}
        onError={() => setFailed(logo)}
      />
      {!custom && <span>{name}</span>}
    </div>
  );
}

export default function BrandPanel({ settings = {}, preview = false }) {
  const theme = useTheme();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 720px)");
  const animated = settings.loginTemplate !== "minimal" && !reducedMotion;
  const media = settings.loginSidePanelImage || settings.loginBackgroundContent;
  const video = /\.(mp4|webm|ogg)$/i.test(media || "");
  const darkSurface = !preview && theme.palette.type === "dark";
  const logo = publicBrandAsset(
    darkSurface
      ? settings.appLogoDark || settings.appLogoLight
      : settings.appLogoLight || settings.appLogoDark
  );
  if (narrow && !preview) return null;
  return (
    <aside
      className={`login-brand-panel${preview ? " login-brand-panel--preview" : ""}`}
      data-animated={animated}
      data-custom-media={Boolean(media)}
      aria-label={i18n.t("loginExperience.brandPanel")}
    >
      <div className="login-brand-grid" aria-hidden="true" />
      {media &&
        (video ? (
          <video
            key={`${media}-${animated}`}
            className="login-brand-media"
            src={publicBrandAsset(media)}
            autoPlay={animated}
            onTimeUpdate={event => {
              if (event.currentTarget.currentTime >= 4)
                event.currentTarget.pause();
            }}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        ) : (
          <img
            className="login-brand-media"
            src={publicBrandAsset(media)}
            alt=""
          />
        ))}
      <div className="login-brand-shade" aria-hidden="true" />
      <div className="login-brand-orbits" aria-hidden="true">
        {[0, 1, 2].map(index => (
          <motion.div
            key={`${index}-${animated}`}
            className={`login-orbit login-orbit--${index}`}
            initial={animated ? { opacity: 0, scale: 0.92 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              animated
                ? {
                    duration: 1.5 + index * 0.4,
                    ease: "easeInOut"
                  }
                : { duration: 0 }
            }
          />
        ))}
        <BackgroundPaths animated={animated} />
      </div>
      <div className="login-brand-content">
        <BrandLogo logo={logo} name={settings.appName || "Espaço Whats"} />
        <h2>{settings.loginHeadline || i18n.t("loginExperience.headline")}</h2>
        <p>
          {settings.loginDescription || i18n.t("loginExperience.description")}
        </p>
        <span className="login-brand-line" aria-hidden="true" />
      </div>
    </aside>
  );
}
