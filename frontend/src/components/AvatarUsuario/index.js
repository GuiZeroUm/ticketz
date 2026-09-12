import React from "react";
import Avatar from "@material-ui/core/Avatar";
import { corAvatar } from "../../helpers/coresAvatar";
import { getInitials } from "../../helpers/getInitials";
import { urlFotoUsuario } from "../../helpers/urlFotoUsuario";

export default function AvatarUsuario({
  usuario,
  tamanho = 36,
  style,
  ...props
}) {
  return (
    <Avatar
      {...props}
      src={urlFotoUsuario(usuario?.profilePicUrl)}
      alt={usuario?.name || ""}
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
      {getInitials(usuario?.name || "")}
    </Avatar>
  );
}
