import React from "react";
import { Link } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Workflow,
  Clock,
  MessageSquare,
  Palette,
  Users,
  Plug,
  Building,
  CreditCard,
  Languages,
  Handshake,
  BookOpen,
  SlidersHorizontal,
  Phone,
  ArrowUpRight
} from "lucide-react";
import { i18n } from "../../translate/i18n";
import { useIdentidade } from "../interface";
import "./central.css";

export default function CentralConfiguracoes({
  selecionar,
  superusuario,
  administrador,
  horarios,
  voz
}) {
  const identidade = useIdentidade();
  const grupos = [
    {
      id: "atendimento",
      itens: [
        { chave: "filas", icone: Workflow, to: "/queues" },
        { chave: "fluxos", icone: Workflow, to: "/fluxos" },
        ...(horarios
          ? [{ chave: "horarios", icone: Clock, aba: "schedules" }]
          : []),
        { chave: "mensagens", icone: MessageSquare, to: "/quick-messages" },
        ...(administrador
          ? [{ chave: "aparencia", icone: Palette, aba: "whitelabel" }]
          : []),
        { chave: "opcoes", icone: SlidersHorizontal, aba: "options" }
      ]
    },
    {
      id: "equipe",
      itens: [
        { chave: "usuarios", icone: Users, to: "/users" },
        ...(administrador
          ? [{ chave: "ajuda", icone: BookOpen, aba: "helps" }]
          : [])
      ]
    },
    {
      id: "canais",
      itens: [
        { chave: "conexoes", icone: Plug, to: "/connections" },
        { chave: "integracoes", icone: Plug, to: "/chatgpt" },
        ...(administrador && voz
          ? [{ chave: "voz", icone: Phone, aba: "voiceCalls" }]
          : [])
      ]
    },
    ...(superusuario
      ? [
          {
            id: "administracao",
            itens: [
              { chave: "empresas", icone: Building, aba: "companies" },
              { chave: "planos", icone: CreditCard, aba: "plans" },
              { chave: "parceiros", icone: Handshake, aba: "partners" },
              { chave: "pagamentos", icone: CreditCard, aba: "paymentGateway" },
              { chave: "traducoes", icone: Languages, aba: "i18n" }
            ]
          }
        ]
      : [])
  ];
  return (
    <Tabs.Root
      defaultValue="atendimento"
      className="ew-ui central-configuracoes"
      style={identidade}
    >
      <Tabs.List
        className="ew-tabs"
        aria-label={i18n.t("centralConfig.secoes")}
      >
        {grupos.map(grupo => (
          <Tabs.Trigger key={grupo.id} value={grupo.id} className="ew-tab">
            {i18n.t(`centralConfig.${grupo.id}`)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {grupos.map(grupo => (
        <Tabs.Content key={grupo.id} value={grupo.id}>
          <div className="central-config-grade">
            {grupo.itens.map(item => {
              const Conteudo = (
                <>
                  <span className="central-config-icone">
                    <item.icone size={21} />
                  </span>
                  <span className="central-config-texto">
                    <strong>
                      {i18n.t(`centralConfig.itens.${item.chave}.titulo`)}
                    </strong>
                    <span>
                      {i18n.t(`centralConfig.itens.${item.chave}.descricao`)}
                    </span>
                  </span>
                  <ArrowUpRight size={16} />
                </>
              );
              return item.to ? (
                <Link
                  key={item.chave}
                  to={item.to}
                  className="central-config-card"
                >
                  {Conteudo}
                </Link>
              ) : (
                <button
                  key={item.chave}
                  type="button"
                  className="central-config-card"
                  onClick={() => selecionar(item.aba)}
                >
                  {Conteudo}
                </button>
              );
            })}
          </div>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
