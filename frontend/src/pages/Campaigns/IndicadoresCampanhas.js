import React from "react";
import { i18n } from "../../translate/i18n";
import "./campanhas.css";
const indicadores = [
  ["EM_ANDAMENTO", "emAndamento"],
  ["PROGRAMADA", "agendadas"],
  ["FINALIZADA", "concluidas"],
  ["INATIVA", "inativas"]
];
export default function IndicadoresCampanhas({ campanhas }) {
  return (
    <div className="campanhas-indicadores">
      {indicadores.map(([status, chave]) => (
        <div className="campanha-indicador" key={status}>
          <p>{i18n.t(`visual.${chave}`)}</p>
          <strong>
            {campanhas.filter(campanha => campanha.status === status).length}
          </strong>
          <small>{i18n.t("visual.campanhasPagina")}</small>
        </div>
      ))}
    </div>
  );
}
