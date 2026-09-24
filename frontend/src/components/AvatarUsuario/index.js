import React, { useState } from "react";
import Avatar from "@material-ui/core/Avatar";
import { corAvatar } from "../../helpers/coresAvatar";
import { getInitials } from "../../helpers/getInitials";
import { urlFotoUsuario } from "../../helpers/urlFotoUsuario";
import { avatarIlustrado } from "../../helpers/avatarIlustrado";

function FotoUsuario({ usuario, tamanho, style, ...props }) {
  const [fotoFalhou, setFotoFalhou] = useState(false);
  const [ilustracaoFalhou, setIlustracaoFalhou] = useState(false);
  const foto = urlFotoUsuario(usuario?.profilePicUrl);
  const ilustracao = avatarIlustrado("usuario", usuario?.id);
  const src = (!fotoFalhou && foto) || (!ilustracaoFalhou && ilustracao);

  return (
    <Avatar
      {...props}
      style={{
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
        fontSize: tamanho / 3,
        backgroundColor: corAvatar(String(usuario?.id || usuario?.name || "")),
        color: "white",
        ...style
      }}
    >
      {src ? (
        <img
          src={src}
          alt={usuario?.name || ""}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => {
            if (src === foto) setFotoFalhou(true);
            else setIlustracaoFalhou(true);
          }}
        />
      ) : (
        getInitials(usuario?.name || "")
      )}
    </Avatar>
  );
}

export default function AvatarUsuario({
  usuario,
  tamanho = 36,
  style,
  ...props
}) {
  const key = `${usuario?.id}:${usuario?.profilePicUrl}`;
  return (
    <FotoUsuario
      key={key}
      usuario={usuario}
      tamanho={tamanho}
      style={style}
      {...props}
    />
  );
}
