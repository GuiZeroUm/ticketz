import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { MoreHorizontal } from "lucide-react";
import { BotaoIcone, useIdentidade } from "../components/interface";
import { i18n } from "../translate/i18n";

export default function FerramentasBarra({ children }) {
  const identidade = useIdentidade();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <BotaoIcone titulo={i18n.t("visual.ferramentas")} variante="ghost">
          <MoreHorizontal size={19} />
        </BotaoIcone>
      </Popover.Trigger>
      <Popover.Portal forceMount>
        <Popover.Content
          forceMount
          className="ew-ui barra-ferramentas"
          style={identidade}
          sideOffset={12}
          align="end"
          aria-label={i18n.t("visual.ferramentas")}
        >
          <strong>{i18n.t("visual.ferramentas")}</strong>
          <div>{children}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
