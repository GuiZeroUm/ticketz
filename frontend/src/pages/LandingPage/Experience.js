import React, { useEffect, useRef, useState } from "react";
import {
  AccountTreeOutlined,
  ArrowForwardRounded,
  AssessmentOutlined,
  BlurOnRounded,
  CheckCircleRounded,
  EventOutlined,
  ForumOutlined,
  GroupOutlined,
  LabelOutlined,
  QuestionAnswerOutlined,
  ScheduleOutlined,
  SendRounded,
  AndroidOutlined,
  SwapHorizRounded,
  VerifiedUserOutlined,
  ViewQuiltOutlined,
  WhatsApp,
  CropFreeRounded,
  ContactsOutlined
} from "@material-ui/icons";
import { Megaphone, Sparkles } from "lucide-react";
import { i18n } from "../../translate/i18n";
import { AI_ADDONS, assetUrl, formatMoney, usePublicPlans } from "./plans";

const t = (key, options) => i18n.t(`landing.${key}`, options);
const list = key => i18n.t(`landing.${key}`, { returnObjects: true });

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Scroll progress (0..1) of a tall section while its sticky child is pinned.
   The landing scrolls inside #root, not the window. */
const useScrollProgress = (ref, enabled = true) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.getElementById("root");
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = ref.current;
        if (!node || !root) return;
        const rect = node.getBoundingClientRect();
        const rootTop = root.getBoundingClientRect().top;
        const distance = node.offsetHeight - root.clientHeight;
        const value = (rootTop - rect.top) / Math.max(1, distance);
        setProgress(Math.max(0, Math.min(1, value)));
      });
    };
    update();
    root?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref, enabled]);
  return progress;
};

const useMedia = query => {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [query]);
  return matches;
};

/* ------------------------------------------------------------------ */
/* Pieces: a 3D keyboard of product features that lights up in waves. */
/* ------------------------------------------------------------------ */

const PIECE_ICONS = {
  inbox: ForumOutlined,
  queues: AccountTreeOutlined,
  ai: Sparkles,
  tags: LabelOutlined,
  campaigns: Megaphone,
  chatbot: AndroidOutlined,
  reports: AssessmentOutlined,
  schedule: EventOutlined,
  contacts: ContactsOutlined,
  transfer: SwapHorizRounded,
  quick: QuestionAnswerOutlined,
  qrcode: CropFreeRounded,
  official: VerifiedUserOutlined,
  team: GroupOutlined,
  kanban: ViewQuiltOutlined,
  hours: ScheduleOutlined
};
const PIECE_KEYS = Object.keys(PIECE_ICONS);
const COLUMNS = 12;
const ROWS = 5;
const TONES = ["primary", "green", "orange", "accent"];

// Deterministic layout: labelled keys spread across the board, blanks between.
const BOARD = Array.from({ length: COLUMNS * ROWS }, (_, index) => {
  const labelled = index % 5 !== 2;
  const key = labelled ? PIECE_KEYS[(index * 5) % PIECE_KEYS.length] : null;
  return { index, key };
});

export const Pieces = ({ reduced = false }) => {
  const [lit, setLit] = useState({
    0: "primary",
    3: "accent",
    5: "orange",
    8: "primary",
    13: "accent",
    17: "primary",
    20: "orange",
    24: "primary",
    28: "accent",
    33: "orange",
    38: "primary",
    42: "accent",
    47: "primary",
    51: "orange",
    55: "accent"
  });
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const boardRef = useRef(null);
  const areaRef = useRef(null);
  const progress = useScrollProgress(areaRef);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: document.getElementById("root") }
    );
    observer.observe(areaRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || prefersReducedMotion() || !visible) return undefined;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      // A diagonal wave travels across the board, colouring a few keys.
      const next = {};
      BOARD.forEach(({ index }) => {
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        const wave = (column + row * 2 + step) % 7;
        if ((wave === 0 || wave === 1) && (index * 7 + step) % 4 !== 0) {
          next[index] = TONES[(index + step) % TONES.length];
        }
      });
      setLit(next);
    }, 1100);
    return () => clearInterval(timer);
  }, [reduced, visible]);

  const select = cell => {
    if (!cell.key) return;
    setSelected(cell);
  };

  const piece = selected ? list(`pieces.items.${selected.key}`) : null;
  const tilt = reduced ? 20 : 24 - progress * 7;

  return (
    <section
      className="lpx-pieces"
      ref={areaRef}
      aria-labelledby="lpx-pieces-title"
    >
      <div className="lp-wrap lpx-pieces-head">
        <span className="lp-kicker" id="lpx-pieces-title">
          {t("motion.pieces")}
        </span>
        <span className="lp-kicker">{t("motion.piecesHint")} +</span>
      </div>
      <div className="lpx-board-scene">
        <div className="lpx-board-viewport">
          <div
            className="lpx-board"
            ref={boardRef}
            style={{ "--lpx-tilt": `${tilt}deg` }}
          >
            {BOARD.map(cell => {
              const Icon = cell.key ? PIECE_ICONS[cell.key] : null;
              const tone = lit[cell.index];
              const isSelected = selected?.index === cell.index;
              return cell.key ? (
                <button
                  type="button"
                  key={cell.index}
                  className={`lpx-key ${tone ? `is-lit is-${tone}` : ""} ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => select(cell)}
                  aria-pressed={isSelected}
                  aria-label={list(`pieces.items.${cell.key}`).title}
                >
                  <span className="lpx-key-top">
                    <Icon />
                    <small>{list(`pieces.items.${cell.key}`).title}</small>
                  </span>
                </button>
              ) : (
                <span
                  key={cell.index}
                  className={`lpx-key lpx-key--blank ${tone ? `is-lit is-${tone}` : ""}`}
                  aria-hidden="true"
                >
                  <span className="lpx-key-top" />
                </span>
              );
            })}
          </div>
        </div>
        <div className="lpx-caption" aria-live="polite">
          {piece ? (
            <div key={selected.index} className="lpx-caption-card">
              <strong>{piece.title}</strong>
              <p>{piece.description}</p>
            </div>
          ) : (
            <div className="lpx-caption-card lpx-caption-card--hint">
              <BlurOnRounded />
              <a href="#agente">
                {t("motion.prompt")} <ArrowForwardRounded />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Ask the agent: a prompt types itself and the work gets done.       */
/* ------------------------------------------------------------------ */

export const AskAgent = ({ reduced = false }) => {
  const prompts = list("ask.prompts");
  const [active, setActive] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState("typing");
  const [done, setDone] = useState(0);
  const [visible, setVisible] = useState(false);
  const areaRef = useRef(null);
  const reduce = reduced || prefersReducedMotion();
  const prompt = prompts[active];

  useEffect(() => {
    const node = areaRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: document.getElementById("root"), threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTyped(reduce ? prompt.text.length : 0);
    setDone(reduce ? prompt.results.length : 0);
    setPhase(reduce ? "done" : "typing");
  }, [active, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || reduce) return undefined;
    let timer;
    if (phase === "typing") {
      if (typed < prompt.text.length) {
        timer = setTimeout(() => setTyped(value => value + 1), 28);
      } else {
        timer = setTimeout(() => setPhase("sending"), 450);
      }
    } else if (phase === "sending") {
      timer = setTimeout(() => setPhase("working"), 650);
    } else if (phase === "working") {
      if (done < prompt.results.length) {
        timer = setTimeout(() => setDone(value => value + 1), 700);
      } else {
        timer = setTimeout(() => setPhase("done"), 400);
      }
    } else if (phase === "done") {
      timer = setTimeout(
        () => setActive(value => (value + 1) % prompts.length),
        4200
      );
    }
    return () => clearTimeout(timer);
  }, [visible, phase, typed, done, prompt, prompts.length, reduce]);

  return (
    <section className="lpx-ask lp-wrap" ref={areaRef} id="agente">
      <div className="lpx-ask-head">
        <span className="lp-kicker">
          <i />
          {t("ask.eyebrow")}
        </span>
        <h2>
          {t("ask.title")}
          <em>{t("ask.highlight")}</em>
        </h2>
        <p>{t("ask.description")}</p>
      </div>
      <div className={`lpx-ask-card is-${phase}`}>
        <div className="lpx-ask-top">
          <span className="lpx-ask-orb">
            <Sparkles />
          </span>
          <span>
            <small>{t("ask.cardLabel")}</small>
            <strong>{t("ask.cardTitle")}</strong>
          </span>
        </div>
        <div className="lpx-ask-input">
          <p>
            {prompt.text.slice(0, typed)}
            {phase === "typing" && <span className="lpx-caret" />}
          </p>
          <span className="lpx-ask-send">
            <SendRounded />
          </span>
        </div>
        <ul className="lpx-ask-results">
          {prompt.results.map((result, index) => (
            <li
              key={`${active}-${result}`}
              className={index < done ? "is-done" : ""}
            >
              {index < done ? (
                <CheckCircleRounded />
              ) : (
                <span className="lpx-spinner" />
              )}
              {result}
            </li>
          ))}
        </ul>
      </div>
      <div
        className="lpx-ask-chips"
        role="tablist"
        aria-label={t("ask.eyebrow")}
      >
        {prompts.map((item, index) => (
          <button
            type="button"
            role="tab"
            key={item.chip}
            aria-selected={index === active}
            className={index === active ? "is-active" : ""}
            onClick={() => setActive(index)}
          >
            {item.chip}
          </button>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Official vs QR code: a pinned stage that tells the story on scroll. */
/* ------------------------------------------------------------------ */

const MODE_STAGES = ["official", "unofficial", "same"];

export const ModesTrack = ({ reduced = false }) => {
  const areaRef = useRef(null);
  const supportsPin = useMedia(
    "(min-width: 961px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)"
  );
  const pinned = supportsPin && !reduced;
  const progress = useScrollProgress(areaRef, pinned);
  const [manual, setManual] = useState(0);
  const [touched, setTouched] = useState(false);
  const stage = pinned ? Math.min(2, Math.floor(progress * 3)) : manual;

  // Without the pinned scroll stage, the story advances on its own until
  // the visitor picks a step.
  useEffect(() => {
    if (pinned || touched || reduced || prefersReducedMotion())
      return undefined;
    const timer = setInterval(() => setManual(value => (value + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, [pinned, touched, reduced]);
  const current = MODE_STAGES[stage];

  const jump = index => {
    if (!pinned) {
      setTouched(true);
      setManual(index);
      return;
    }
    const root = document.getElementById("root");
    const area = areaRef.current;
    const top =
      area.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    root.scrollTo({
      top: top + (area.offsetHeight - root.clientHeight) * ((index + 0.2) / 3),
      behavior: "smooth"
    });
  };

  return (
    <section
      className={`lpx-modes ${pinned ? "is-pinned" : ""}`}
      id="conexao"
      ref={areaRef}
      style={{ "--lpx-progress": progress }}
    >
      <div className="lpx-modes-sticky lp-wrap">
        <div className="lp-section-heading">
          <div>
            <span className="lp-kicker">
              <i />
              {t("modes.eyebrow")}
            </span>
            <h2>{t("modes.title")}</h2>
          </div>
          <p>{t("modes.description")}</p>
        </div>
        <div className={`lpx-modes-stage is-${current}`}>
          <div className="lpx-modes-art" aria-hidden="true">
            <img
              className="lpx-art lpx-art--official"
              src={assetUrl("/branding/checkout/oficial.webp")}
              alt=""
              width="320"
              height="320"
            />
            <img
              className="lpx-art lpx-art--unofficial"
              src={assetUrl("/branding/checkout/qrcode.webp")}
              alt=""
              width="320"
              height="320"
            />
            <span className="lpx-art-link">
              <WhatsApp />
            </span>
          </div>
          <div className="lpx-modes-copy">
            {MODE_STAGES.map((key, index) => (
              <article
                key={key}
                className={`lpx-mode-panel lpx-mode-panel--${key} ${
                  index === stage ? "is-active" : ""
                }`}
                aria-hidden={index !== stage}
              >
                <span className="lpx-mode-tag">{t(`modes.${key}.tag`)}</span>
                <h3>{t(`modes.${key}.title`)}</h3>
                <p>{t(`modes.${key}.description`)}</p>
                <ul>
                  {list(`modes.${key}.points`).map(point => (
                    <li key={point}>
                      <CheckCircleRounded />
                      {point}
                    </li>
                  ))}
                </ul>
                {t(`modes.${key}.note`) && (
                  <p className="lpx-mode-note">{t(`modes.${key}.note`)}</p>
                )}
              </article>
            ))}
          </div>
        </div>
        <div className="lpx-modes-controls">
          <span className="lpx-modes-bar">
            <i
              style={{
                transform: `scaleX(${pinned ? progress : (stage + 1) / 3})`
              }}
            />
          </span>
          {MODE_STAGES.map((key, index) => (
            <button
              type="button"
              key={key}
              onClick={() => jump(index)}
              aria-pressed={index === stage}
            >
              <span>0{index + 1}</span>
              {t(`modes.${key}.tag`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

const planName = plan =>
  plan.tier && plan.tier !== "custom"
    ? t(`plans.tiers.${plan.tier}.name`)
    : plan.name;

export const Plans = () => {
  const { plans, status } = usePublicPlans();
  return (
    <section className="lpx-plans lp-wrap" id="planos">
      <div className="lp-section-heading" data-lp-motion>
        <div>
          <span className="lp-kicker">
            <i />
            {t("plans.eyebrow")}
          </span>
          <h2>{t("plans.title")}</h2>
        </div>
        <p>{t("plans.description")}</p>
      </div>
      {status === "loading" && (
        <div className="lpx-plan-grid" aria-busy="true">
          {[0, 1, 2].map(index => (
            <div className="lpx-plan lpx-plan--skeleton" key={index} />
          ))}
        </div>
      )}
      {status === "ready" && (
        <div className="lpx-plan-grid">
          {plans.map((plan, index) => {
            const recommended = plan.tier === "ai";
            const tier = plan.tier !== "custom" ? plan.tier : null;
            return (
              <article
                key={plan.id}
                className={`lpx-plan ${recommended ? "is-recommended" : ""}`}
                data-lp-motion
                style={{ "--lp-delay": `${index * 110}ms` }}
              >
                {recommended && (
                  <span className="lpx-plan-badge">
                    {t("plans.recommended")}
                  </span>
                )}
                <h3>{planName(plan)}</h3>
                <p className="lpx-plan-pitch">
                  {tier
                    ? t(`plans.tiers.${tier}.pitch`)
                    : t("plans.customPitch")}
                </p>
                <p className="lpx-plan-price">
                  <strong>{formatMoney(plan.value, plan.currency)}</strong>
                  <span>{t("plans.perMonth")}</span>
                </p>
                <p
                  className={`lpx-plan-ai ${plan.aiIncluded ? "is-included" : ""}`}
                >
                  <Sparkles />
                  {plan.aiIncluded
                    ? t("plans.aiUnlimited")
                    : t("plans.aiSeparate")}
                </p>
                <ul>
                  <li>
                    <CheckCircleRounded />
                    {t("plans.users", { count: plan.users })}
                  </li>
                  <li>
                    <CheckCircleRounded />
                    {t("plans.connections", { count: plan.connections })}
                  </li>
                  <li>
                    <CheckCircleRounded />
                    {t("plans.queues", { count: plan.queues })}
                  </li>
                  <li>
                    <CheckCircleRounded />
                    {t("plans.bothModes")}
                  </li>
                </ul>
                <a
                  className={`lp-button ${recommended ? "" : "lp-button--outline"}`}
                  href={`/assinar?plano=${plan.id}`}
                >
                  {t("plans.choose", { name: planName(plan) })}
                  <ArrowForwardRounded />
                </a>
              </article>
            );
          })}
        </div>
      )}
      {(status === "error" || status === "empty") && (
        <p className="lpx-plans-empty">{t("plans.unavailable")}</p>
      )}
      <div className="lpx-addons" data-lp-motion>
        <div>
          <span className="lpx-addons-icon">
            <Sparkles />
          </span>
          <h3>{t("addons.title")}</h3>
          <p>{t("addons.description")}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("addons.package")}</th>
              <th scope="col">{t("addons.monthly")}</th>
              <th scope="col">{t("addons.includes")}</th>
            </tr>
          </thead>
          <tbody>
            {AI_ADDONS.map(addon => (
              <tr key={addon.id}>
                <th scope="row">{t(`addons.items.${addon.id}.name`)}</th>
                <td>{formatMoney(addon.value)}</td>
                <td>{t(`addons.items.${addon.id}.includes`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
