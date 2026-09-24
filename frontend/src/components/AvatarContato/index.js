import React, { useEffect, useRef, useState } from "react";
import Avatar from "@material-ui/core/Avatar";
import api from "../../services/api";
import { avatarIlustrado } from "../../helpers/avatarIlustrado";

function Foto({ contact, children, alt, ...props }) {
  const [pictures, setPictures] = useState(contact);
  const [failed, setFailed] = useState([]);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const attempted = useRef(false);
  const src = [pictures.profilePicUrl, pictures.profileHiresPictureUrl].find(
    url => url && !failed.includes(url)
  );
  const fallback = !contact.isGroup && avatarIlustrado("contato", contact.id);

  useEffect(() => {
    if (
      src ||
      !contact.id ||
      attempted.current ||
      (contact.channel && contact.channel !== "whatsapp")
    )
      return;
    attempted.current = true;
    let active = true;
    Promise.resolve()
      .then(() => api.post(`/contacts/${contact.id}/picture/refresh`))
      .then(({ data }) => {
        if (active) setPictures(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [src, contact.id, contact.channel]);

  return (
    <Avatar {...props}>
      {src ? (
        <img
          src={src}
          alt={alt || contact.name || ""}
          referrerPolicy="no-referrer"
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setFailed(previous => [...previous, src])}
        />
      ) : fallback && !fallbackFailed ? (
        <img
          src={fallback}
          alt={alt || contact.name || ""}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setFallbackFailed(true)}
        />
      ) : (
        children
      )}
    </Avatar>
  );
}

export default function AvatarContato({ contact = {}, ...props }) {
  // Remount on tenant/contact/URL changes; an old request cannot repaint another contact.
  const key = `${contact.companyId}:${contact.id}:${contact.profilePicUrl}:${contact.profileHiresPictureUrl}`;
  return <Foto key={key} contact={contact} {...props} />;
}
