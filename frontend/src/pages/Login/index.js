import React, { useContext, useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Button,
  CssBaseline,
  TextField,
  MenuItem,
  Menu,
  IconButton,
  InputAdornment,
  useMediaQuery,
  useTheme
} from "@material-ui/core";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Globe2, Moon, Sun } from "lucide-react";
import AppleIcon from "@material-ui/icons/Apple";
import { FcGoogle } from "react-icons/fc";
import { i18n } from "../../translate/i18n";
import { messages } from "../../translate/languages";
import { AuthContext } from "../../context/Auth/AuthContext";
import useSettings from "../../hooks/useSettings";
import ColorModeContext from "../../layout/themeContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import getCompanySlug from "../../helpers/getCompanySlug";
import BrandPanel, {
  BrandLogo,
  publicBrandAsset
} from "../../components/LoginExperience/BrandPanel";

export const parseLoginLinks = value => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          link =>
            typeof link?.title === "string" &&
            typeof link?.url === "string" &&
            /^https?:\/\//i.test(link.url)
        )
      : [];
  } catch (_) {
    return [];
  }
};

const settingKeys = [
  "allowSignup",
  "loginPageLinks",
  "loginSidePanelImage",
  "loginBackgroundContent",
  "appLogoLight",
  "appLogoDark",
  "appName",
  "loginHeadline",
  "loginDescription",
  "loginTemplate"
];

function SocialProviders() {
  return (
    <>
      <div className="login-social-divider">
        {i18n.t("loginExperience.socialDivider")}
      </div>
      <div
        className="login-social-buttons"
        aria-describedby="social-coming-soon"
      >
        <button type="button" disabled>
          <FcGoogle aria-hidden="true" />
          Google
        </button>
        <button type="button" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#f35325" d="M2 2h9v9H2z" />
            <path fill="#81bc06" d="M13 2h9v9h-9z" />
            <path fill="#05a6f0" d="M2 13h9v9H2z" />
            <path fill="#ffba08" d="M13 13h9v9h-9z" />
          </svg>
          Microsoft
        </button>
        <button type="button" disabled>
          <AppleIcon aria-hidden="true" />
          Apple
        </button>
      </div>
      <p id="social-coming-soon" className="login-social-note">
        {i18n.t("loginExperience.socialSoon")}
      </p>
    </>
  );
}

export default function Login() {
  const theme = useTheme();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { colorMode } = useContext(ColorModeContext);
  const { handleLogin, handlePasswordSetup, loading } = useContext(AuthContext);
  const { getPublicSetting } = useSettings();
  const [branding, setBranding] = useState({});
  const [langMenuAnchor, setLangMenuAnchor] = useState(null);
  const [language, setLanguage] = useState(
    localStorage.getItem("language") || i18n.language || "en"
  );
  const [user, setUser] = useState({
    email: "",
    password: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [step, setStep] = useState("email");
  const [activationToken, setActivationToken] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const disabled = loading || busy;

  useEffect(() => {
    let active = true;
    Promise.all(
      settingKeys.map(async key => {
        try {
          return [key, await getPublicSetting(key)];
        } catch (_) {
          return [key, ""];
        }
      })
    ).then(entries => {
      if (active) setBranding(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
    // Public branding is scoped by the host slug, not the previously signed-in company.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChooseLanguage = async lang => {
    setLangMenuAnchor(null);
    localStorage.setItem("language", lang);
    await i18n.changeLanguage(lang);
    setLanguage(lang);
  };
  const handleChangeInput = event => {
    setFormError("");
    const { name, value } = event.target;
    setUser(current => ({ ...current, [name]: value }));
  };
  const handleChangeEmail = () => {
    setStep("email");
    setActivationToken("");
    setFormError("");
    setShowPassword(false);
    setUser(current => ({
      ...current,
      password: "",
      newPassword: "",
      confirmPassword: ""
    }));
  };
  const handleSubmit = async event => {
    event.preventDefault();
    if (submitting.current || disabled) return;
    submitting.current = true;
    setBusy(true);
    setFormError("");
    try {
      if (step === "email") {
        const slug = getCompanySlug();
        const { data } = await api.post("/auth/login/identify", {
          email: user.email.trim(),
          ...(slug ? { slug } : {})
        });
        if (data.proxima_etapa === "criar_senha") {
          setActivationToken(data.ativacao_token);
          setStep("createPassword");
        } else {
          setStep("password");
        }
      } else if (step === "password") {
        await handleLogin({
          email: user.email.trim(),
          password: user.password
        });
      } else {
        if (user.newPassword !== user.confirmPassword) {
          setFormError(i18n.t("login.errors.passwordMismatch"));
          return;
        }
        if (
          !(
            user.newPassword.length >= 8 &&
            /[a-z]/.test(user.newPassword) &&
            /[A-Z]/.test(user.newPassword) &&
            /[0-9]/.test(user.newPassword)
          )
        ) {
          setFormError(i18n.t("login.errors.passwordStrength"));
          return;
        }
        await handlePasswordSetup({
          token: activationToken,
          password: user.newPassword,
          password_confirmation: user.confirmPassword
        });
      }
    } catch (error) {
      if (error.response?.data?.error === "ERR_EMAIL_NOT_FOUND")
        setFormError(i18n.t("login.errors.emailNotFound"));
      else toastError(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const passwordField = (name, label, autofocus = false) => (
    <TextField
      key={name}
      variant="outlined"
      fullWidth
      required
      disabled={disabled}
      id={name}
      name={name}
      label={i18n.t(label)}
      value={user[name]}
      onChange={handleChangeInput}
      type={showPassword ? "text" : "password"}
      autoComplete={name === "password" ? "current-password" : "new-password"}
      autoFocus={autofocus}
      helperText={
        name === "confirmPassword"
          ? i18n.t("login.form.passwordStrength")
          : undefined
      }
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              size="small"
              type="button"
              disabled={disabled}
              onClick={() => setShowPassword(value => !value)}
              aria-label={i18n.t(
                showPassword
                  ? "loginExperience.hidePassword"
                  : "loginExperience.showPassword"
              )}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </IconButton>
          </InputAdornment>
        )
      }}
    />
  );
  const logo = publicBrandAsset(
    theme.palette.type === "dark"
      ? branding.appLogoDark || branding.appLogoLight
      : branding.appLogoLight || branding.appLogoDark
  );
  const title =
    step === "createPassword"
      ? i18n.t("login.buttons.createPassword")
      : i18n.t("loginExperience.welcome");
  const links = parseLoginLinks(branding.loginPageLinks);
  return (
    <main
      className="login-experience"
      data-theme={theme.palette.type}
      style={{ "--login-accent": theme.palette.primary.main }}
    >
      <CssBaseline />
      <section className="login-form-pane" aria-label={i18n.t("login.title")}>
        <header className="login-toolbar">
          <BrandLogo
            logo={logo}
            name={branding.appName || "Espaço Whats"}
            compact
          />
          <div className="login-tools">
            <IconButton
              onClick={event => setLangMenuAnchor(event.currentTarget)}
              aria-label={i18n.t("mainDrawer.appBar.i18n.language")}
              aria-haspopup="menu"
            >
              <Globe2 size={20} />
            </IconButton>
            <IconButton
              onClick={colorMode.toggleColorMode}
              aria-label={i18n.t(
                theme.palette.type === "light"
                  ? "loginExperience.darkMode"
                  : "loginExperience.lightMode"
              )}
            >
              {theme.palette.type === "light" ? (
                <Moon size={20} />
              ) : (
                <Sun size={20} />
              )}
            </IconButton>
          </div>
        </header>
        <Menu
          anchorEl={langMenuAnchor}
          open={Boolean(langMenuAnchor)}
          onClose={() => setLangMenuAnchor(null)}
        >
          {Object.keys(messages).map(lang => (
            <MenuItem
              key={lang}
              selected={language === lang}
              onClick={() => handleChooseLanguage(lang)}
            >
              {messages[lang].translations.mainDrawer.appBar.i18n.language}
            </MenuItem>
          ))}
        </Menu>
        <div className="login-form-content">
          <span className="login-eyebrow">
            {i18n.t("loginExperience.eyebrow")}
          </span>
          <h1>{title}</h1>
          <p className="login-form-subtitle">
            {i18n.t(
              step === "email"
                ? "loginExperience.emailHint"
                : step === "password"
                  ? "loginExperience.passwordHint"
                  : "loginExperience.setupHint"
            )}
          </p>
          <motion.div
            key={step}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.22 }}
          >
            <form onSubmit={handleSubmit} aria-busy={disabled}>
              {step === "email" ? (
                <TextField
                  variant="outlined"
                  fullWidth
                  required
                  type="email"
                  id="email"
                  label={i18n.t("login.form.email")}
                  name="email"
                  value={user.email}
                  onChange={handleChangeInput}
                  autoComplete="username"
                  autoFocus
                  disabled={disabled}
                />
              ) : (
                <div className="login-email-summary">
                  <span>{user.email.trim()}</span>
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    disabled={disabled}
                  >
                    {i18n.t("login.buttons.changeEmail")}
                  </button>
                </div>
              )}
              {step === "password" &&
                passwordField("password", "login.form.password", true)}
              {step === "createPassword" && (
                <>
                  {passwordField("newPassword", "login.form.newPassword", true)}
                  {passwordField(
                    "confirmPassword",
                    "login.form.confirmPassword"
                  )}
                </>
              )}
              {formError && (
                <div className="login-error" role="alert">
                  {formError}
                </div>
              )}
              <Button
                className="login-submit"
                type="submit"
                fullWidth
                variant="contained"
                color="primary"
                endIcon={!disabled && <ArrowRight size={18} />}
                disabled={
                  disabled ||
                  !user.email.trim() ||
                  (step === "password" && !user.password) ||
                  (step === "createPassword" &&
                    (!user.newPassword || !user.confirmPassword))
                }
              >
                {disabled
                  ? i18n.t("loginExperience.loading")
                  : i18n.t(
                      step === "email"
                        ? "login.buttons.continue"
                        : step === "createPassword"
                          ? "login.buttons.createPassword"
                          : "login.buttons.submit"
                    )}
              </Button>
            </form>
          </motion.div>
          <SocialProviders />
          {branding.allowSignup === "enabled" && step === "email" && (
            <RouterLink className="login-register" to="/signup">
              {i18n.t("login.buttons.register")}
            </RouterLink>
          )}
        </div>
        <footer className="login-footer">
          {links.map((link, index) => (
            <a
              href={link.url}
              key={`${link.url}-${index}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.title}
            </a>
          ))}
        </footer>
      </section>
      <BrandPanel settings={branding} />
    </main>
  );
}
