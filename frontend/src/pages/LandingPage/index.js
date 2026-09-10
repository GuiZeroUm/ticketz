import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { getContrastRatio } from "@material-ui/core/styles";
import {
  ArrowForwardRounded,
  ArrowDownwardRounded,
  ForumOutlined,
  GroupOutlined,
  WhatsApp,
  HistoryRounded,
  DoneAllRounded,
  AccountTreeOutlined,
  ScheduleOutlined,
  AssessmentOutlined,
  CloseRounded,
  MenuRounded,
  CheckCircleOutlineRounded,
  SendRounded,
  MoreHorizRounded,
  AddRounded
} from "@material-ui/icons";
import config, { getBackendURL } from "../../services/config";
import { i18n } from "../../translate/i18n";
import "./styles.css";

const t = key => i18n.t(`landing.${key}`);
const list = key => i18n.t(`landing.${key}`, { returnObjects: true });
const stageIcons = [ForumOutlined, AccountTreeOutlined, HistoryRounded];

const Brand = () => (
  <span className="lp-logo">
    <span>
      <ForumOutlined />
    </span>
    <strong>
      Espaço<span>Whats</span>
    </strong>
  </span>
);

const Inbox = ({ preview = false }) => (
  <div className={`lp-inbox ${preview ? "lp-inbox--preview" : ""}`}>
    <aside className="lp-inbox-rail" aria-hidden="true">
      <ForumOutlined />
      <GroupOutlined />
      <AccountTreeOutlined />
      <AssessmentOutlined />
    </aside>
    <div className="lp-inbox-list">
      <div className="lp-inbox-heading">
        <strong>{t("mock.inbox")}</strong>
        <span>04</span>
      </div>
      <div className="lp-inbox-tabs">
        <span>{t("mock.waiting")}</span>
        <b>{t("mock.open")}</b>
      </div>
      {list("mock.contacts").map((contact, index) => (
        <div
          className={`lp-inbox-row ${index === 0 ? "is-selected" : ""}`}
          key={contact.name}
        >
          <span className={`lp-avatar lp-avatar--${index}`}>
            {contact.initials}
          </span>
          <div>
            <strong>{contact.name}</strong>
            <small>{contact.message}</small>
          </div>
          <small>{contact.time}</small>
        </div>
      ))}
    </div>
    <div className="lp-chat">
      <header>
        <span className="lp-avatar">MC</span>
        <div>
          <strong>{list("mock.contacts")[0].name}</strong>
          <small>{t("mock.salesQueue")}</small>
        </div>
        <MoreHorizRounded />
      </header>
      <div className="lp-messages">
        <small>{t("mock.today")}</small>
        <p>
          {t("mock.customerMessage")}
          <small>10:32</small>
        </p>
        <p className="is-sent">
          {t("mock.agentMessage")}
          <small>
            10:33 <DoneAllRounded />
          </small>
        </p>
        <span className="lp-typing" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <footer>
        <span>{t("mock.typeMessage")}</span>
        <SendRounded />
      </footer>
    </div>
  </div>
);

const Journey = () => {
  const [active, setActive] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const areaRef = useRef(null);
  const steps = list("story.steps");

  useEffect(() => {
    const root = document.getElementById("root");
    const media = window.matchMedia(
      "(min-width: 961px) and (min-height: 900px) and (prefers-reduced-motion: no-preference)"
    );
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!media.matches || !areaRef.current || !root) return;
        const rect = areaRef.current.getBoundingClientRect();
        const distance = areaRef.current.offsetHeight - root.clientHeight;
        const progress = Math.max(
          0,
          Math.min(
            0.999,
            (root.getBoundingClientRect().top - rect.top) /
              Math.max(1, distance)
          )
        );
        setActive(Math.floor(progress * 3));
      });
    };
    const modeChanged = () => {
      setScrollEnabled(media.matches);
      update();
    };
    modeChanged();
    root?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", modeChanged);
    media.addEventListener("change", modeChanged);
    return () => {
      cancelAnimationFrame(frame);
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", modeChanged);
      media.removeEventListener("change", modeChanged);
    };
  }, []);

  const select = index => {
    setActive(index);
    if (!scrollEnabled) return;
    const root = document.getElementById("root");
    const area = areaRef.current;
    const top =
      area.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    root.scrollTo({
      top: top + (area.offsetHeight - root.clientHeight) * ((index + 0.1) / 3),
      behavior: "instant"
    });
  };

  return (
    <section className="lp-journey" id="como-funciona" ref={areaRef}>
      <div className="lp-journey-sticky lp-wrap">
        <div className="lp-section-heading">
          <div>
            <span className="lp-kicker">{t("story.eyebrow")}</span>
            <h2>
              {t("story.title")}
              <em>{t("story.highlight")}</em>
            </h2>
          </div>
          <p>{t(scrollEnabled ? "story.scrollHint" : "story.clickHint")}</p>
        </div>
        <div className="lp-demo">
          <div className="lp-demo-toolbar">
            <Brand />
            <span>
              <i />
              {t("story.demo")}
            </span>
            <span className="lp-demo-connected">
              <CheckCircleOutlineRounded />
              {t("story.connected")}
            </span>
          </div>
          <div
            className="lp-demo-stage"
            id="lp-journey-panel"
            role="region"
            aria-label={steps[active].title}
          >
            <div className="lp-stage-content" key={active}>
              {active === 0 && <Inbox />}
              {active === 1 && (
                <div className="lp-routing-demo">
                  <div className="lp-route-message">
                    <WhatsApp />
                    <div>
                      <small>{t("routing.newMessage")}</small>
                      <strong>{t("routing.customer")}</strong>
                    </div>
                  </div>
                  <div className="lp-route-connector" />
                  <div className="lp-team-grid">
                    {list("mock.teamMembers")
                      .slice(0, 3)
                      .map((member, index) => (
                        <div
                          className={index === 0 ? "is-selected" : ""}
                          key={member.name}
                        >
                          <span className={`lp-avatar lp-avatar--${index}`}>
                            {member.initials}
                          </span>
                          <strong>{member.name}</strong>
                          <small>{member.role}</small>
                          {index === 0 && (
                            <span className="lp-assigned">
                              <DoneAllRounded />
                              {t("mock.open")}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {active === 2 && (
                <div className="lp-context-demo">
                  <div className="lp-profile">
                    <span className="lp-avatar">MC</span>
                    <h3>{list("mock.contacts")[0].name}</h3>
                    <p>{t("mock.company")}</p>
                    <span className="lp-tag">{t("mock.hotLead")}</span>
                    <span className="lp-tag">{t("mock.returning")}</span>
                  </div>
                  <div className="lp-timeline">
                    {["history", "salesQueue", "followUp"].map((key, index) => {
                      const Icon = [
                        HistoryRounded,
                        GroupOutlined,
                        ScheduleOutlined
                      ][index];
                      return (
                        <div key={key}>
                          <Icon />
                          <span>
                            <small>0{index + 1}</small>
                            <strong>{t(`mock.${key}`)}</strong>
                          </span>
                          <CheckCircleOutlineRounded />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="lp-demo-controls" aria-label={t("story.clickHint")}>
            {steps.map((step, index) => {
              const Icon = stageIcons[index];
              return (
                <button
                  key={step.title}
                  onClick={() => select(index)}
                  aria-pressed={active === index}
                  aria-controls="lp-journey-panel"
                >
                  <span>0{index + 1}</span>
                  <Icon />
                  {step.label}
                  <ArrowForwardRounded />
                </button>
              );
            })}
          </div>
        </div>
        <div className="lp-step-caption">
          <span>0{active + 1} / 03</span>
          <div>
            <h3>{steps[active].title}</h3>
            <p>{steps[active].description}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

const LandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [brand, setBrand] = useState({
    primaryColorLight: "#0000FF",
    primaryColorDark: "#39ACE7"
  });
  const whatsappNumber = String(config.LANDING_WHATSAPP_NUMBER || "").replace(
    /\D/g,
    ""
  );
  const contactUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(t("contact.whatsappMessage"))}`
    : "/signup";
  const featureIndexes = [0, 1, 3, 5, 7, 11];
  const featureIcons = [
    ForumOutlined,
    GroupOutlined,
    HistoryRounded,
    SendRounded,
    AccountTreeOutlined,
    AssessmentOutlined
  ];

  useEffect(() => {
    const root = document.getElementById("root");
    root?.classList.add("landing-root");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    ["primaryColorLight", "primaryColorDark"].forEach(key => {
      fetch(`${getBackendURL()}/public-settings/${key}`, {
        signal: controller.signal
      })
        .then(response => (response.ok ? response.json() : null))
        .then(value => {
          if (
            !controller.signal.aborted &&
            typeof value === "string" &&
            /^#[\da-f]{6}$/i.test(value)
          ) {
            setBrand(current => ({ ...current, [key]: value }));
          }
        })
        .catch(() => {});
    });
    return () => {
      root?.classList.remove("landing-root");
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);
  return (
    <div
      className="landing-page"
      style={{
        "--lp-primary": brand.primaryColorLight,
        "--lp-accent": brand.primaryColorDark,
        "--lp-on-primary":
          getContrastRatio(brand.primaryColorLight, "#fff") >= 4.5
            ? "#fff"
            : "#111820"
      }}
    >
      <Helmet>
        <title>{t("meta.title")}</title>
        <meta name="description" content={t("meta.description")} />
      </Helmet>
      <a className="lp-skip" href="#inicio">
        {t("story.skip")}
      </a>
      <header className="lp-header">
        <a href="#inicio" aria-label={t("nav.home")} onClick={closeMenu}>
          <Brand />
        </a>
        <button
          className="lp-menu-button"
          onClick={() => setMenuOpen(value => !value)}
          aria-expanded={menuOpen}
          aria-controls="lp-navigation"
          aria-label={t("nav.menu")}
        >
          {menuOpen ? <CloseRounded /> : <MenuRounded />}
        </button>
        <nav
          id="lp-navigation"
          className={menuOpen ? "is-open" : ""}
          onKeyDown={event => {
            if (event.key === "Escape") closeMenu();
          }}
        >
          <a href="#como-funciona" onClick={closeMenu}>
            {t("nav.howItWorks")}
          </a>
          <a href="#recursos" onClick={closeMenu}>
            {t("nav.features")}
          </a>
          <a href="#contato" onClick={closeMenu}>
            {t("nav.contact")}
          </a>
        </nav>
        <div className="lp-header-actions">
          <a href="/login">{t("story.login")}</a>
          <a className="lp-button lp-button--small" href="/signup">
            {t("story.start")}
            <ArrowForwardRounded />
          </a>
        </div>
      </header>
      <main>
        <section className="lp-hero lp-wrap" id="inicio">
          <span className="lp-kicker">
            <i />
            {t("story.heroEyebrow")}
          </span>
          <div className="lp-hero-grid">
            <h1>
              {t("story.heroTitle")}
              <em>
                {t("story.heroHighlight")}
                <span className="lp-title-arrow" aria-hidden="true">
                  <ArrowForwardRounded />
                </span>
              </em>
            </h1>
            <div className="lp-hero-copy">
              <span className="lp-kicker">{t("story.heroAside")}</span>
              <p>{t("story.heroDescription")}</p>
              <div className="lp-actions">
                <a className="lp-button" href="/signup">
                  {t("story.start")}
                  <ArrowForwardRounded />
                </a>
                <a className="lp-text-link" href="#como-funciona">
                  {t("actions.seeHow")}
                  <ArrowDownwardRounded />
                </a>
              </div>
            </div>
          </div>
          <div className="lp-hero-product">
            <div className="lp-product-label">
              <span>
                <WhatsApp />
                {t("mock.workspace")}
              </span>
              <span>{t("story.demo")}</span>
            </div>
            <Inbox preview />
            <div className="lp-floating-note">
              <CheckCircleOutlineRounded />
              <span>
                <small>{t("hero.queueLabel")}</small>
                <strong>{t("hero.queueValue")}</strong>
              </span>
            </div>
          </div>
          <div className="lp-proof-row">
            {list("hero.proofs").map(proof => (
              <span key={proof}>
                <CheckCircleOutlineRounded />
                {proof}
              </span>
            ))}
          </div>
        </section>
        <section className="lp-intro lp-wrap">
          <span className="lp-kicker">{t("story.introEyebrow")}</span>
          <h2>
            {t("story.introTitle")}
            <em>{t("story.introHighlight")}</em>
          </h2>
          <p>{t("story.introDescription")}</p>
          <a
            href="#como-funciona"
            className="lp-round-link"
            aria-label={t("actions.seeHow")}
          >
            <ArrowDownwardRounded />
          </a>
        </section>
        <Journey />
        <section className="lp-features lp-wrap" id="recursos">
          <div className="lp-section-heading">
            <div>
              <span className="lp-kicker">{t("features.eyebrow")}</span>
              <h2>{t("story.featuresTitle")}</h2>
            </div>
            <p>{t("features.description")}</p>
          </div>
          <div className="lp-feature-grid">
            {featureIndexes.map((featureIndex, index) => {
              const feature = list("features.items")[featureIndex];
              const Icon = featureIcons[index];
              return (
                <article key={feature.title}>
                  <div>
                    <Icon />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="lp-faq lp-wrap">
          <div>
            <span className="lp-kicker">{t("faq.eyebrow")}</span>
            <h2>{t("faq.title")}</h2>
          </div>
          <div>
            {list("faq.items").map(faq => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <AddRounded />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="lp-cta" id="contato">
          <div className="lp-wrap">
            <span className="lp-kicker">{t("story.ctaEyebrow")}</span>
            <h2>
              {t("story.ctaTitle")}
              <em>{t("story.ctaHighlight")}</em>
            </h2>
            <p>{t("story.ctaDescription")}</p>
            <div className="lp-actions">
              <a className="lp-button" href="/signup">
                {t("story.start")}
                <ArrowForwardRounded />
              </a>
              <a
                className="lp-button lp-button--outline"
                href={contactUrl}
                {...(whatsappNumber
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              >
                {t(
                  whatsappNumber
                    ? "actions.talkWhatsApp"
                    : "story.createAccount"
                )}
                <ArrowForwardRounded />
              </a>
            </div>
            <div className="lp-cta-tiles" aria-hidden="true">
              {stageIcons.map((Icon, index) => (
                <span key={index}>
                  <Icon />
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer lp-wrap">
        <Brand />
        <p>{t("footer.description")}</p>
        <nav>
          <a href="/login">{t("story.login")}</a>
          <a
            href="https://github.com/GuiZeroUm/ticketz"
            target="_blank"
            rel="noreferrer"
          >
            {t("story.source")}
          </a>
        </nav>
        <small>
          © {new Date().getFullYear()} Espaço Whats. {t("footer.rights")}
        </small>
      </footer>
    </div>
  );
};

export default LandingPage;
