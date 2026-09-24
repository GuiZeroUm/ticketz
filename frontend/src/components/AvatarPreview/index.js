import React from "react";
import { Dialog, IconButton } from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import { i18n } from "../../translate/i18n";
import "./styles.css";

export default function AvatarPreview({
  open,
  onClose,
  src,
  alt,
  illustrated
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label={alt || i18n.t("fluxos.fechar")}
      PaperProps={{ className: "avatar-preview-dialog" }}
    >
      <IconButton
        className="avatar-preview-close"
        aria-label={i18n.t("fluxos.fechar")}
        onClick={onClose}
      >
        <CloseIcon />
      </IconButton>
      <img
        className={
          illustrated
            ? "avatar-preview-image one-works-card"
            : "avatar-preview-image"
        }
        src={src}
        alt={alt || ""}
      />
    </Dialog>
  );
}
