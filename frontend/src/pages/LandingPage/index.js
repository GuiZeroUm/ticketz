import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import {
  AccountTreeOutlined,
  AccountBalanceWalletOutlined,
  AddOutlined,
  AlternateEmailOutlined,
  AnnouncementOutlined,
  ArrowForwardRounded,
  AssessmentOutlined,
  AndroidOutlined,
  ChatBubbleOutlineRounded,
  CheckCircleRounded,
  ChevronRightRounded,
  CloudUploadOutlined,
  CloseRounded,
  DashboardOutlined,
  DeleteOutlineOutlined,
  DoneAllRounded,
  ExpandMoreRounded,
  EditOutlined,
  ForumOutlined,
  GroupOutlined,
  HeadsetMicOutlined,
  HelpOutline,
  HistoryRounded,
  EmojiObjectsOutlined,
  FlashOnOutlined,
  LabelOutlined,
  LanguageRounded,
  LockOutlined,
  MenuRounded,
  MoreHorizRounded,
  PaletteOutlined,
  PersonOutlineRounded,
  QueryBuilderRounded,
  RecordVoiceOverOutlined,
  ScheduleOutlined,
  SearchRounded,
  SendRounded,
  SettingsOutlined,
  SwapHoriz,
  TrendingUpRounded,
  WhatsApp
} from "@material-ui/icons";

import config from "../../services/config";
import { i18n } from "../../translate/i18n";

import "./styles.css";

const featureIcons = [
  ForumOutlined,
  GroupOutlined,
  WhatsApp,
  PersonOutlineRounded,
  LabelOutlined,
  FlashOnOutlined,
  ScheduleOutlined,
  AccountTreeOutlined,
  AlternateEmailOutlined,
  RecordVoiceOverOutlined,
  EmojiObjectsOutlined,
  AssessmentOutlined
];

const integrationIcons = [
  EmojiObjectsOutlined,
  LanguageRounded,
  FlashOnOutlined,
  GroupOutlined
];

const AnimatedInbox = ({ compact = false }) => {
  const contacts = i18n.t("landing.mock.contacts", { returnObjects: true });

  return (
    <div className={`lp-inbox ${compact ? "lp-inbox--compact" : ""}`}>
      <aside className="lp-inbox__rail" aria-hidden="true">
        <span className="lp-inbox__brand">E</span>
        <ForumOutlined />
        <PersonOutlineRounded />
        <ScheduleOutlined />
        <AssessmentOutlined />
        <SettingsOutlined />
      </aside>
      <div className="lp-inbox__list">
        <div className="lp-inbox__list-head">
          <div>
            <small>{i18n.t("landing.mock.workspace")}</small>
            <strong>{i18n.t("landing.mock.inbox")}</strong>
          </div>
          <SearchRounded />
        </div>
        <div className="lp-inbox__tabs">
          <span>{i18n.t("landing.mock.waiting")}</span>
          <span className="is-active">{i18n.t("landing.mock.open")}</span>
          <span>{i18n.t("landing.mock.done")}</span>
        </div>
        {contacts.map((contact, index) => (
          <div
            className={`lp-contact ${index === 0 ? "is-selected" : ""}`}
            key={contact.name}
            style={{ "--delay": `${index * 0.7}s` }}
          >
            <span className={`lp-avatar lp-avatar--${index + 1}`}>
              {contact.initials}
            </span>
            <span className="lp-contact__copy">
              <strong>{contact.name}</strong>
              <small>{contact.message}</small>
            </span>
            <span className="lp-contact__meta">
              <small>{contact.time}</small>
              {contact.unread && <b>{contact.unread}</b>}
            </span>
          </div>
        ))}
      </div>
      <div className="lp-chat">
        <div className="lp-chat__head">
          <span className="lp-avatar lp-avatar--1">MC</span>
          <div>
            <strong>{contacts[0].name}</strong>
            <small>{i18n.t("landing.mock.salesQueue")}</small>
          </div>
          <span className="lp-chat__status">
            <i /> {i18n.t("landing.mock.online")}
          </span>
          <MoreHorizRounded />
        </div>
        <div className="lp-chat__messages">
          <span className="lp-date-chip">{i18n.t("landing.mock.today")}</span>
          <div className="lp-message lp-message--received">
            {i18n.t("landing.mock.customerMessage")}
            <small>10:32</small>
          </div>
          <div className="lp-message lp-message--sent">
            {i18n.t("landing.mock.agentMessage")}
            <small>
              10:33 <DoneAllRounded />
            </small>
          </div>
          <div className="lp-message lp-message--received lp-message--typing">
            <i /> <i /> <i />
          </div>
        </div>
        <div className="lp-chat__composer">
          <span>{i18n.t("landing.mock.typeMessage")}</span>
          <SendRounded />
        </div>
      </div>
      {!compact && (
        <aside className="lp-customer-card">
          <small>{i18n.t("landing.mock.customer")}</small>
          <span className="lp-avatar lp-avatar--large lp-avatar--1">MC</span>
          <strong>{contacts[0].name}</strong>
          <span>{i18n.t("landing.mock.company")}</span>
          <div className="lp-tags">
            <b>{i18n.t("landing.mock.hotLead")}</b>
            <b>{i18n.t("landing.mock.returning")}</b>
          </div>
          <hr />
          <p>
            <HistoryRounded /> {i18n.t("landing.mock.history")}
          </p>
          <p>
            <ScheduleOutlined /> {i18n.t("landing.mock.followUp")}
          </p>
        </aside>
      )}
    </div>
  );
};

const BugDot = () => (
  <span className="lp-system-demo__bug" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);

const ProductShell = ({ active, children }) => {
  const navigation = [
    ["tickets", WhatsApp],
    ["quick", EditOutlined],
    ["automation", FlashOnOutlined],
    ["contacts", PersonOutlineRounded],
    ["schedule", ScheduleOutlined],
    ["tags", LabelOutlined],
    ["chat", ForumOutlined],
    ["help", HelpOutline],
    ["dashboard", DashboardOutlined],
    ["news", AnnouncementOutlined],
    ["connections", SwapHoriz],
    ["queues", AccountTreeOutlined],
    ["users", GroupOutlined],
    ["billing", AccountBalanceWalletOutlined],
    ["settings", SettingsOutlined]
  ];

  return (
    <div className="lp-system-demo">
      <aside className="lp-system-demo__rail" aria-hidden="true">
        <span className="lp-system-demo__logo">EW</span>
        {navigation.map(([key, Icon], index) => (
          <span
            className={`${active === key ? "is-active" : ""} ${
              index === 8 || index === 9 ? "has-divider" : ""
            }`}
            key={key}
          >
            <Icon />
          </span>
        ))}
      </aside>
      <header className="lp-system-demo__topbar">
        <MenuRounded />
        <div>
          <BugDot />
          <span className="lp-system-demo__notice">3</span>
          <span className="lp-system-demo__user">
            <b>{i18n.t("landing.productDemo.admin")}</b>
            <small>{i18n.t("landing.productDemo.company")}</small>
          </span>
          <PersonOutlineRounded />
        </div>
      </header>
      <main className="lp-system-demo__main">{children}</main>
    </div>
  );
};

const DemoButton = ({ children, icon: Icon }) => (
  <span className="lp-demo-button">
    {Icon && <Icon />}
    {children}
  </span>
);

const DemoTable = ({ headers, rows, type }) => (
  <div className={`lp-demo-table lp-demo-table--${type || "default"}`}>
    <div className="lp-demo-table__row lp-demo-table__head">
      {headers.map(header => (
        <span key={header}>{header}</span>
      ))}
    </div>
    {rows.map((row, rowIndex) => (
      <div className="lp-demo-table__row" key={`${type}-${rowIndex}`}>
        {row.map((cell, cellIndex) => (
          <span
            key={`${cellIndex}-${typeof cell === "object" ? cell.label : cell}`}
          >
            {cellIndex === 0 && type === "contacts" && (
              <i className={`lp-demo-avatar lp-demo-avatar--${rowIndex + 1}`}>
                {cell.initials}
              </i>
            )}
            {typeof cell === "object" ? cell.label : cell}
            {cellIndex === row.length - 1 && (
              <b className="lp-demo-actions" aria-hidden="true">
                <EditOutlined />
                <DeleteOutlineOutlined />
              </b>
            )}
          </span>
        ))}
      </div>
    ))}
  </div>
);

const TicketsDemo = ({ demo }) => (
  <ProductShell active="tickets">
    <div className="lp-tickets-demo">
      <section className="lp-ticket-list">
        <div className="lp-ticket-tabs">
          <span className="is-active">{demo.tickets.open}</span>
          <span>{demo.tickets.resolved}</span>
          <span>{demo.tickets.search}</span>
        </div>
        <div className="lp-ticket-toolbar">
          <DemoButton icon={AddOutlined}>{demo.tickets.newTicket}</DemoButton>
          <span>{demo.tickets.all}</span>
          <span className="lp-demo-select">{demo.tickets.queues}⌄</span>
        </div>
        <div className="lp-ticket-status-tabs">
          <span className="is-active">{demo.tickets.serving}</span>
          <span>
            {demo.tickets.waiting} <b>3</b>
          </span>
        </div>
        <div className="lp-ticket-rows">
          {demo.tickets.contacts.map((contact, index) => (
            <div className={index === 0 ? "is-active" : ""} key={contact.name}>
              <i className={`lp-demo-avatar lp-demo-avatar--${index + 1}`}>
                {contact.initials}
              </i>
              <span>
                <strong>{contact.name}</strong>
                <small>{contact.message}</small>
              </span>
              <em>
                {contact.time}
                {index < 2 && <b>{index + 1}</b>}
              </em>
            </div>
          ))}
        </div>
      </section>
      <section className="lp-real-chat">
        <header>
          <i className="lp-demo-avatar lp-demo-avatar--1">LM</i>
          <span>
            <strong>{demo.tickets.contacts[0].name}</strong>
            <small>{demo.tickets.queueName}</small>
          </span>
          <MoreHorizRounded />
        </header>
        <div className="lp-real-chat__body">
          <b>{demo.tickets.today}</b>
          <p className="is-received">
            {demo.tickets.customerMessage}
            <small>10:32</small>
          </p>
          <p className="is-sent">
            {demo.tickets.agentMessage}
            <small>
              10:33 <DoneAllRounded />
            </small>
          </p>
        </div>
        <footer>
          <span>{demo.tickets.typeMessage}</span>
          <SendRounded />
        </footer>
      </section>
    </div>
  </ProductShell>
);

const ContactsDemo = ({ demo }) => (
  <ProductShell active="contacts">
    <div className="lp-product-page">
      <div className="lp-product-page__heading">
        <h4>{demo.contacts.title}</h4>
        <div className="lp-product-page__search">
          <SearchRounded /> {demo.contacts.search}
        </div>
        <div>
          <DemoButton icon={CloudUploadOutlined} />
          <DemoButton>{demo.contacts.import}</DemoButton>
          <DemoButton icon={AddOutlined}>{demo.contacts.add}</DemoButton>
        </div>
      </div>
      <DemoTable
        type="contacts"
        headers={demo.contacts.headers}
        rows={demo.contacts.rows.map(row => [
          { initials: row.initials, label: row.name },
          row.whatsapp,
          row.email,
          ""
        ])}
      />
    </div>
  </ProductShell>
);

const ConnectionsDemo = ({ demo }) => (
  <ProductShell active="connections">
    <div className="lp-product-page">
      <div className="lp-product-page__heading">
        <h4>{demo.connections.title}</h4>
        <div />
        <DemoButton icon={AddOutlined}>{demo.connections.add}</DemoButton>
      </div>
      <DemoTable
        type="connections"
        headers={demo.connections.headers}
        rows={demo.connections.rows}
      />
      <div className="lp-queue-card">
        <span>
          <AccountTreeOutlined />
          <b>{demo.connections.queueTitle}</b>
          <small>{demo.connections.queueDescription}</small>
        </span>
        <i />
        <strong>{demo.connections.queueGreeting}</strong>
        <EditOutlined />
      </div>
    </div>
  </ProductShell>
);

const CampaignsDemo = ({ demo }) => (
  <ProductShell active="news">
    <div className="lp-product-page">
      <div className="lp-product-page__heading">
        <h4>{demo.campaigns.title}</h4>
        <div className="lp-product-page__search">
          <SearchRounded /> {demo.campaigns.search}
        </div>
        <DemoButton icon={AddOutlined}>{demo.campaigns.add}</DemoButton>
      </div>
      <div className="lp-campaign-summary">
        {demo.campaigns.summary.map((item, index) => (
          <span key={item.label}>
            <i className={`is-${index + 1}`} />
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <DemoTable
        type="campaigns"
        headers={demo.campaigns.headers}
        rows={demo.campaigns.rows}
      />
    </div>
  </ProductShell>
);

const RealDashboardDemo = ({ demo }) => (
  <ProductShell active="dashboard">
    <div className="lp-real-dashboard">
      <div className="lp-real-dashboard__primary">
        {demo.dashboard.primary.map((item, index) => (
          <span key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            {index < 2 && <i className={`lp-demo-ring is-${index + 1}`} />}
          </span>
        ))}
      </div>
      <div className="lp-real-dashboard__filters">
        {demo.dashboard.filters.map(item => (
          <span key={item.label}>
            <small>{item.label}</small>
            <b>{item.value}</b>
          </span>
        ))}
      </div>
      <div className="lp-real-dashboard__secondary">
        {demo.dashboard.secondary.map(item => (
          <span key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <AssessmentOutlined />
          </span>
        ))}
      </div>
      <div className="lp-real-dashboard__chart">
        <strong>{demo.dashboard.chartTitle}</strong>
        <i />
        <i />
        <i />
        <i />
        <svg viewBox="0 0 600 110" preserveAspectRatio="none">
          <path d="M0 96 L420 96 L475 93 L520 88 L565 98 L600 26 L600 110 L0 110 Z" />
          <polyline points="0,96 420,96 475,93 520,88 565,98 600,26" />
        </svg>
      </div>
    </div>
  </ProductShell>
);

const WhiteLabelDemo = ({ demo }) => (
  <ProductShell active="settings">
    <div className="lp-whitelabel-demo">
      <h4>{demo.whiteLabel.title}</h4>
      <div className="lp-whitelabel-demo__tabs">
        {demo.whiteLabel.tabs.map(tab => (
          <span
            className={tab === demo.whiteLabel.activeTab ? "is-active" : ""}
            key={tab}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="lp-whitelabel-demo__fields">
        {demo.whiteLabel.fields.map((field, index) => (
          <label key={field.label}>
            <small>{field.label}</small>
            <span>
              {index < 2 && <i className={`is-color-${index + 1}`} />}
              {field.value}
            </span>
          </label>
        ))}
      </div>
      <div className="lp-whitelabel-demo__previews">
        <span>
          <i>ESPAÇO</i>
          <b>WHATS</b>
          <small>{demo.whiteLabel.logoCaption}</small>
        </span>
        <span className="is-dark">
          <i>ESPAÇO</i>
          <b>WHATS</b>
          <small>{demo.whiteLabel.logoCaption}</small>
        </span>
        <span className="is-favicon">EW</span>
      </div>
      <h5>{demo.whiteLabel.loginLinks}</h5>
      <p>{demo.whiteLabel.loginDescription}</p>
      <div className="lp-whitelabel-demo__links">
        <span>{demo.whiteLabel.linkTitle}</span>
        <span>{demo.whiteLabel.linkUrl}</span>
        <DemoButton>{demo.whiteLabel.save}</DemoButton>
      </div>
    </div>
  </ProductShell>
);

const ProductTour = () => {
  const [active, setActive] = useState(0);
  const scrollRef = useRef(null);
  const items = i18n.t("landing.tour.items", { returnObjects: true });
  const demo = i18n.t("landing.productDemo", { returnObjects: true });
  const icons = [
    ForumOutlined,
    PersonOutlineRounded,
    AccountTreeOutlined,
    RecordVoiceOverOutlined,
    DashboardOutlined,
    PaletteOutlined
  ];
  const screens = [
    TicketsDemo,
    ContactsDemo,
    ConnectionsDemo,
    CampaignsDemo,
    RealDashboardDemo,
    WhiteLabelDemo
  ];
  const ActiveScreen = screens[active];

  useEffect(() => {
    const root = document.getElementById("root");
    const scrollArea = scrollRef.current;
    if (!root || !scrollArea) return undefined;

    const updateActiveStep = () => {
      const rect = scrollArea.getBoundingClientRect();
      const distance = Math.max(1, scrollArea.offsetHeight - root.clientHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / distance));
      setActive(
        Math.min(items.length - 1, Math.floor(progress * items.length))
      );
    };

    updateActiveStep();
    root.addEventListener("scroll", updateActiveStep, { passive: true });
    window.addEventListener("resize", updateActiveStep);

    return () => {
      root.removeEventListener("scroll", updateActiveStep);
      window.removeEventListener("resize", updateActiveStep);
    };
  }, [items.length]);

  const goToStep = index => {
    const root = document.getElementById("root");
    const scrollArea = scrollRef.current;
    if (!root || !scrollArea) return;
    const areaTop = scrollArea.getBoundingClientRect().top + root.scrollTop;
    const distance = Math.max(1, scrollArea.offsetHeight - root.clientHeight);
    root.scrollTo({
      behavior: "smooth",
      top: areaTop + distance * ((index + 0.2) / items.length)
    });
  };

  return (
    <div className="lp-scroll-tour" ref={scrollRef}>
      <div className="lp-scroll-tour__sticky">
        <div className="lp-scroll-tour__layout">
          <nav aria-label={i18n.t("landing.tour.ariaLabel")}>
            {items.map((item, index) => {
              const Icon = icons[index];
              return (
                <button
                  className={active === index ? "is-active" : ""}
                  key={item.title}
                  onClick={() => goToStep(index)}
                  aria-current={active === index ? "step" : undefined}
                >
                  <span className="lp-scroll-tour__progress">
                    <i />
                    <b>{String(index + 1).padStart(2, "0")}</b>
                  </span>
                  <Icon />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.short}</small>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="lp-scroll-tour__stage">
            <div className="lp-scroll-tour__copy" key={`copy-${active}`}>
              <div>
                <span>{String(active + 1).padStart(2, "0")}</span>
                <strong>{items[active].title}</strong>
              </div>
              <p>{items[active].description}</p>
            </div>
            <div className="lp-scroll-tour__screen" key={`screen-${active}`}>
              <ActiveScreen demo={demo} />
            </div>
            <div className="lp-scroll-tour__spotlight">
              <CheckCircleRounded /> {items[active].highlight}
            </div>
          </div>
        </div>
        <span className="lp-scroll-tour__hint">
          <i /> {i18n.t("landing.tour.scrollHint")}
        </span>
      </div>
    </div>
  );
};

const LandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const problems = i18n.t("landing.problem.items", { returnObjects: true });
  const pillars = i18n.t("landing.transformation.items", {
    returnObjects: true
  });
  const features = i18n.t("landing.features.items", { returnObjects: true });
  const integrations = i18n.t("landing.integrations.items", {
    returnObjects: true
  });
  const faqs = i18n.t("landing.faq.items", { returnObjects: true });
  const productDemo = i18n.t("landing.productDemo", {
    returnObjects: true
  });
  const whatsappNumber = String(config.LANDING_WHATSAPP_NUMBER || "").replace(
    /\D/g,
    ""
  );
  const baseWhatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}`
    : "https://wa.me/";
  const whatsappUrl = `${baseWhatsappUrl}?text=${encodeURIComponent(
    i18n.t("landing.contact.whatsappMessage")
  )}`;

  useEffect(() => {
    const root = document.getElementById("root");
    root?.classList.add("landing-root");

    return () => root?.classList.remove("landing-root");
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page">
      <Helmet>
        <title>{i18n.t("landing.meta.title")}</title>
        <meta name="description" content={i18n.t("landing.meta.description")} />
      </Helmet>

      <header className="lp-header">
        <a
          className="lp-logo"
          href="#inicio"
          aria-label={i18n.t("landing.nav.home")}
          onClick={closeMenu}
        >
          <span>
            <i />E
          </span>
          <strong>
            Espaço<em>Whats</em>
          </strong>
        </a>
        <button
          className="lp-menu-button"
          onClick={() => setMenuOpen(value => !value)}
          aria-expanded={menuOpen}
          aria-label={i18n.t("landing.nav.menu")}
        >
          {menuOpen ? <CloseRounded /> : <MenuRounded />}
        </button>
        <nav className={menuOpen ? "is-open" : ""}>
          <a href="#como-funciona" onClick={closeMenu}>
            {i18n.t("landing.nav.howItWorks")}
          </a>
          <a href="#recursos" onClick={closeMenu}>
            {i18n.t("landing.nav.features")}
          </a>
          <a href="#integracoes" onClick={closeMenu}>
            {i18n.t("landing.nav.integrations")}
          </a>
          <a href="#equipe" onClick={closeMenu}>
            {i18n.t("landing.nav.team")}
          </a>
          <a href="#contato" onClick={closeMenu}>
            {i18n.t("landing.nav.contact")}
          </a>
        </nav>
        <div className="lp-header__actions">
          <a
            className="lp-button lp-button--small"
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
          >
            {i18n.t("landing.actions.scheduleDemo")}
          </a>
        </div>
      </header>

      <main>
        <section className="lp-hero" id="inicio">
          <div className="lp-orb lp-orb--one" />
          <div className="lp-orb lp-orb--two" />
          <div className="lp-hero__copy">
            <span className="lp-eyebrow">
              <i />
              {i18n.t("landing.hero.eyebrow")}
            </span>
            <h1>
              {i18n.t("landing.hero.titleBefore")}{" "}
              <em>{i18n.t("landing.hero.titleHighlight")}</em>{" "}
              {i18n.t("landing.hero.titleAfter")}
            </h1>
            <p>{i18n.t("landing.hero.description")}</p>
            <div className="lp-hero__actions">
              <a
                className="lp-button"
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                {i18n.t("landing.actions.scheduleDemo")}
                <ArrowForwardRounded />
              </a>
              <a className="lp-button lp-button--ghost" href="#tour">
                {i18n.t("landing.actions.seeHow")}
                <span className="lp-play">▶</span>
              </a>
            </div>
            <div className="lp-trust-row">
              {i18n
                .t("landing.hero.proofs", { returnObjects: true })
                .map(proof => (
                  <span key={proof}>
                    <CheckCircleRounded />
                    {proof}
                  </span>
                ))}
            </div>
          </div>
          <div className="lp-hero__visual">
            <div className="lp-floating-card lp-floating-card--queue">
              <AccountTreeOutlined />
              <span>
                <small>{i18n.t("landing.hero.queueLabel")}</small>
                <strong>{i18n.t("landing.hero.queueValue")}</strong>
              </span>
              <CheckCircleRounded />
            </div>
            <div className="lp-floating-card lp-floating-card--metric">
              <TrendingUpRounded />
              <span>
                <strong>+32%</strong>
                <small>{i18n.t("landing.hero.productivity")}</small>
              </span>
            </div>
            <div className="lp-browser">
              <div className="lp-browser__bar">
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <b>app.espacowhats.com.br</b>
                <LockOutlined />
              </div>
              <AnimatedInbox compact />
            </div>
          </div>
        </section>

        <section className="lp-problem lp-section" id="como-funciona">
          <div className="lp-section-heading lp-section-heading--center">
            <span>{i18n.t("landing.problem.eyebrow")}</span>
            <h2>{i18n.t("landing.problem.title")}</h2>
            <p>{i18n.t("landing.problem.description")}</p>
          </div>
          <div className="lp-problem__grid">
            <div className="lp-chaos" aria-hidden="true">
              {problems.slice(0, 5).map((problem, index) => (
                <span
                  className={`lp-chaos__bubble lp-chaos__bubble--${index + 1}`}
                  key={problem}
                >
                  <ChatBubbleOutlineRounded />
                  <small>{problem}</small>
                </span>
              ))}
              <div className="lp-chaos__center">
                <span className="lp-logo">
                  <span>
                    <i />E
                  </span>
                </span>
                <b>{i18n.t("landing.problem.central")}</b>
              </div>
            </div>
            <div className="lp-problem__list">
              {problems.map((problem, index) => (
                <div key={problem}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{problem}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-transformation lp-section">
          <div className="lp-section-heading">
            <span>{i18n.t("landing.transformation.eyebrow")}</span>
            <h2>{i18n.t("landing.transformation.title")}</h2>
          </div>
          <div className="lp-pillars">
            {pillars.map((pillar, index) => {
              const Icon = [HistoryRounded, GroupOutlined, AssessmentOutlined][
                index
              ];
              return (
                <article key={pillar.title}>
                  <span>
                    <Icon />
                  </span>
                  <small>0{index + 1}</small>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.description}</p>
                  <i className="lp-pillar-line" />
                </article>
              );
            })}
          </div>
        </section>

        <section className="lp-product lp-section" id="tour">
          <div className="lp-section-heading lp-section-heading--center">
            <span>{i18n.t("landing.tour.eyebrow")}</span>
            <h2>{i18n.t("landing.tour.title")}</h2>
            <p>{i18n.t("landing.tour.description")}</p>
          </div>
          <ProductTour />
        </section>

        <section className="lp-steps lp-section">
          <div className="lp-section-heading lp-section-heading--center">
            <span>{i18n.t("landing.steps.eyebrow")}</span>
            <h2>{i18n.t("landing.steps.title")}</h2>
          </div>
          <div className="lp-steps__line">
            <i />
          </div>
          <div className="lp-steps__grid">
            {i18n
              .t("landing.steps.items", { returnObjects: true })
              .map((step, index) => {
                const Icon = [
                  WhatsApp,
                  AccountTreeOutlined,
                  HeadsetMicOutlined
                ][index];
                return (
                  <article key={step.title}>
                    <span className="lp-step-number">0{index + 1}</span>
                    <span className="lp-step-icon">
                      <Icon />
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </article>
                );
              })}
          </div>
        </section>

        <section className="lp-features lp-section" id="recursos">
          <div className="lp-section-heading">
            <span>{i18n.t("landing.features.eyebrow")}</span>
            <h2>{i18n.t("landing.features.title")}</h2>
            <p>{i18n.t("landing.features.description")}</p>
          </div>
          <div className="lp-bento">
            {features.map((feature, index) => {
              const Icon = featureIcons[index];
              return (
                <article
                  className={index === 0 || index === 9 ? "is-wide" : ""}
                  key={feature.title}
                >
                  <span>
                    <Icon />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <ArrowForwardRounded />
                </article>
              );
            })}
          </div>
        </section>

        <section className="lp-routing lp-section" id="equipe">
          <div className="lp-routing__copy">
            <div className="lp-section-heading">
              <span>{i18n.t("landing.routing.eyebrow")}</span>
              <h2>{i18n.t("landing.routing.title")}</h2>
              <p>{i18n.t("landing.routing.description")}</p>
            </div>
            <div className="lp-check-list">
              {i18n
                .t("landing.routing.items", { returnObjects: true })
                .map(item => (
                  <span key={item}>
                    <CheckCircleRounded />
                    {item}
                  </span>
                ))}
            </div>
          </div>
          <div className="lp-route-map">
            <div className="lp-route-map__message">
              <WhatsApp />
              <span>
                <small>{i18n.t("landing.routing.newMessage")}</small>
                <strong>{i18n.t("landing.routing.customer")}</strong>
              </span>
            </div>
            <i className="lp-route-map__path" />
            {i18n
              .t("landing.routing.flow", { returnObjects: true })
              .map((item, index) => (
                <div
                  className={`lp-route-node lp-route-node--${index + 1}`}
                  key={item}
                >
                  <span>
                    {index === 0 ? (
                      <ForumOutlined />
                    ) : index === 1 ? (
                      <GroupOutlined />
                    ) : (
                      <DoneAllRounded />
                    )}
                  </span>
                  <b>{item}</b>
                </div>
              ))}
          </div>
        </section>

        <section className="lp-automation lp-section">
          <div className="lp-section-heading lp-section-heading--center">
            <span>{i18n.t("landing.automation.eyebrow")}</span>
            <h2>{i18n.t("landing.automation.title")}</h2>
            <p>{i18n.t("landing.automation.description")}</p>
          </div>
          <div className="lp-automation__grid">
            <article>
              <span>
                <AndroidOutlined />
              </span>
              <h3>{i18n.t("landing.automation.automationTitle")}</h3>
              <p>{i18n.t("landing.automation.automationDescription")}</p>
              <div className="lp-bot-flow">
                <i>{i18n.t("landing.automation.greeting")}</i>
                <ChevronRightRounded />
                <i>{i18n.t("landing.automation.menu")}</i>
                <ChevronRightRounded />
                <i>{i18n.t("landing.automation.team")}</i>
              </div>
            </article>
            <article>
              <span>
                <RecordVoiceOverOutlined />
              </span>
              <h3>{i18n.t("landing.automation.campaignTitle")}</h3>
              <p>{i18n.t("landing.automation.campaignDescription")}</p>
              <div className="lp-campaign-stats">
                <b>
                  <strong>1.248</strong>
                  <small>{i18n.t("landing.automation.sent")}</small>
                </b>
                <b>
                  <strong>94%</strong>
                  <small>{i18n.t("landing.automation.delivered")}</small>
                </b>
                <b>
                  <strong>38%</strong>
                  <small>{i18n.t("landing.automation.replies")}</small>
                </b>
              </div>
            </article>
          </div>
        </section>

        <section className="lp-metrics lp-section">
          <div className="lp-section-heading">
            <span>{i18n.t("landing.metrics.eyebrow")}</span>
            <h2>{i18n.t("landing.metrics.title")}</h2>
            <p>{i18n.t("landing.metrics.description")}</p>
          </div>
          <div className="lp-metrics__visual">
            <RealDashboardDemo demo={productDemo} />
          </div>
        </section>

        <section className="lp-white-label lp-section">
          <div className="lp-white-label__visual">
            <div className="lp-theme-card lp-theme-card--first">
              <span className="lp-theme-card__nav">ES</span>
              <div>
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="lp-theme-card lp-theme-card--second">
              <span className="lp-theme-card__nav">EW</span>
              <div>
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <span className="lp-theme-switch">
              <PaletteOutlined />
            </span>
          </div>
          <div className="lp-white-label__copy">
            <div className="lp-section-heading">
              <span>{i18n.t("landing.whiteLabel.eyebrow")}</span>
              <h2>{i18n.t("landing.whiteLabel.title")}</h2>
              <p>{i18n.t("landing.whiteLabel.description")}</p>
            </div>
            <div className="lp-check-list">
              {i18n
                .t("landing.whiteLabel.items", { returnObjects: true })
                .map(item => (
                  <span key={item}>
                    <CheckCircleRounded />
                    {item}
                  </span>
                ))}
            </div>
          </div>
        </section>

        <section className="lp-integrations lp-section" id="integracoes">
          <div className="lp-section-heading lp-section-heading--center">
            <span>{i18n.t("landing.integrations.eyebrow")}</span>
            <h2>{i18n.t("landing.integrations.title")}</h2>
            <p>{i18n.t("landing.integrations.description")}</p>
          </div>
          <div className="lp-integrations__grid">
            {integrations.map((item, index) => {
              const Icon = integrationIcons[index];
              return (
                <article key={item.title}>
                  <span>
                    <Icon />
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="lp-contact lp-section" id="contato">
          <div className="lp-contact__copy">
            <span className="lp-eyebrow">
              <i />
              {i18n.t("landing.contact.eyebrow")}
            </span>
            <h2>{i18n.t("landing.contact.title")}</h2>
            <p>{i18n.t("landing.contact.description")}</p>
            <div className="lp-contact__actions">
              <a
                className="lp-button"
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsApp />
                {i18n.t("landing.actions.talkWhatsApp")}
              </a>
            </div>
            <div className="lp-contact__note">
              <QueryBuilderRounded />
              <span>
                <strong>{i18n.t("landing.contact.responseTitle")}</strong>
                <small>{i18n.t("landing.contact.responseDescription")}</small>
              </span>
            </div>
          </div>
        </section>

        <section className="lp-faq lp-section">
          <div className="lp-section-heading lp-section-heading--center">
            <span>{i18n.t("landing.faq.eyebrow")}</span>
            <h2>{i18n.t("landing.faq.title")}</h2>
          </div>
          <div className="lp-faq__list">
            {faqs.map((faq, index) => (
              <details key={faq.question} open={index === 0}>
                <summary>
                  {faq.question}
                  <ExpandMoreRounded />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-logo">
          <span>
            <i />E
          </span>
          <strong>
            Espaço<em>Whats</em>
          </strong>
        </div>
        <p>{i18n.t("landing.footer.description")}</p>
        <nav>
          <a href="#como-funciona">{i18n.t("landing.nav.howItWorks")}</a>
          <a href="#recursos">{i18n.t("landing.nav.features")}</a>
          <a href="#integracoes">{i18n.t("landing.nav.integrations")}</a>
          <a href="#contato">{i18n.t("landing.nav.contact")}</a>
        </nav>
        <small>
          © {new Date().getFullYear()} EspaçoWhats.{" "}
          {i18n.t("landing.footer.rights")}
        </small>
      </footer>
    </div>
  );
};

export default LandingPage;
