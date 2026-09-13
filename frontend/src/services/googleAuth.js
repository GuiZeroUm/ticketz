import api from "./api";
import getCompanySlug from "../helpers/getCompanySlug";
import { loadClerkBrowser } from "./loadClerkBrowser";

export const GOOGLE_CALLBACK = "/login/google/callback";
export const GOOGLE_COMPLETE = "/login/google/complete";
export const GOOGLE_CONTINUE = "/login/google/continue";
export const GOOGLE_ERROR = "/login/google/error";
const INTENT_KEY = "espaco.google-login.intent";
const INTENT_TTL = 10 * 60 * 1000;
let clerkPromise;
let loadedKey;

export const socialError = code => Object.assign(new Error(code), { code });

export function isGoogleConfigured(config) {
  return (
    config?.providers?.google?.enabled === true &&
    /^pk_(test|live)_[A-Za-z0-9_-]+$/.test(config?.publishableKey || "")
  );
}

export async function getGoogleConfiguration() {
  const { data } = await api.get("/auth/social/providers");
  if (!isGoogleConfigured(data)) throw socialError("ERR_SOCIAL_LOGIN_DISABLED");
  return data;
}

export async function loadGoogleClerk(config) {
  if (!isGoogleConfigured(config))
    throw socialError("ERR_SOCIAL_LOGIN_DISABLED");
  if (clerkPromise && loadedKey !== config.publishableKey) {
    // A deployment changed instance while this tab was open: reload, never mix clients.
    throw socialError("ERR_SOCIAL_LOGIN_INVALID");
  }
  if (!clerkPromise) {
    loadedKey = config.publishableKey;
    clerkPromise = loadClerkBrowser(config.publishableKey)
      .then(async clerk => {
        await clerk.load({
          signInUrl: "/login",
          signUpUrl: "/login",
          signInForceRedirectUrl: GOOGLE_COMPLETE,
          signUpForceRedirectUrl: GOOGLE_COMPLETE,
          allowedRedirectOrigins: [window.location.origin],
          localization: { locale: "pt-BR" }
        });
        if (!clerk.loaded || !clerk.client)
          throw socialError("ERR_SOCIAL_LOGIN_DISABLED");
        return clerk;
      })
      .catch(error => {
        clerkPromise = undefined;
        loadedKey = undefined;
        throw error;
      });
  }
  return clerkPromise;
}

export function clearGoogleIntent() {
  sessionStorage.removeItem(INTENT_KEY);
}

export function requireGoogleIntent(config) {
  let intent;
  try {
    intent = JSON.parse(sessionStorage.getItem(INTENT_KEY));
  } catch (_) {}
  if (
    !intent ||
    intent.origin !== window.location.origin ||
    intent.slug !== getCompanySlug() ||
    intent.key !== config.publishableKey ||
    typeof intent.nonce !== "string" ||
    intent.nonce.length < 16 ||
    !Number.isFinite(intent.createdAt) ||
    intent.createdAt > Date.now() ||
    Date.now() - intent.createdAt > INTENT_TTL
  ) {
    clearGoogleIntent();
    throw socialError("ERR_SOCIAL_LOGIN_EXPIRED");
  }
  return intent;
}

export async function startGoogleSignIn(config) {
  const clerk = await loadGoogleClerk(config);
  // Always start a fresh provider selection; an old Clerk session is not an app login.
  if (clerk.session) await clerk.signOut(() => Promise.resolve());
  const nonce = Array.from(
    window.crypto.getRandomValues(new Uint8Array(24)),
    value => value.toString(16).padStart(2, "0")
  ).join("");
  sessionStorage.setItem(
    INTENT_KEY,
    JSON.stringify({
      origin: window.location.origin,
      slug: getCompanySlug(),
      key: config.publishableKey,
      createdAt: Date.now(),
      nonce
    })
  );
  try {
    await clerk.client.signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      oidcPrompt: "select_account",
      redirectUrl: new URL(GOOGLE_CALLBACK, window.location.origin).href,
      redirectUrlComplete: new URL(GOOGLE_COMPLETE, window.location.origin).href
    });
  } catch (error) {
    clearGoogleIntent();
    throw error;
  }
}

export async function handleGoogleCallback(clerk, config) {
  requireGoogleIntent(config);
  await clerk.handleRedirectCallback({
    signInUrl: GOOGLE_ERROR,
    signUpUrl: GOOGLE_ERROR,
    signInForceRedirectUrl: GOOGLE_COMPLETE,
    signUpForceRedirectUrl: GOOGLE_COMPLETE,
    continueSignUpUrl: GOOGLE_CONTINUE,
    firstFactorUrl: GOOGLE_ERROR,
    secondFactorUrl: GOOGLE_ERROR,
    resetPasswordUrl: GOOGLE_ERROR,
    verifyEmailAddressUrl: GOOGLE_ERROR,
    verifyPhoneNumberUrl: GOOGLE_ERROR,
    signInProtectCheckUrl: GOOGLE_ERROR,
    signUpProtectCheckUrl: GOOGLE_ERROR
  });
}

export function requiresOnlyLegalConsent(clerk) {
  const signup = clerk.client?.signUp;
  return (
    signup?.status === "missing_requirements" &&
    signup.missingFields?.length === 1 &&
    signup.missingFields[0] === "legal_accepted"
  );
}

export async function acceptGoogleLegal(clerk, config, accepted) {
  requireGoogleIntent(config);
  if (!accepted || !requiresOnlyLegalConsent(clerk))
    throw socialError("ERR_SOCIAL_LOGIN_INVALID");
  const result = await clerk.client.signUp.update({ legalAccepted: true });
  if (result.status !== "complete" || !result.createdSessionId)
    throw socialError("ERR_SOCIAL_LOGIN_INVALID");
  await clerk.setActive({ session: result.createdSessionId });
}

export async function exchangeGoogleSession(clerk, config, exchange) {
  requireGoogleIntent(config);
  if (
    !clerk.session ||
    clerk.session.status !== "active" ||
    clerk.session.currentTask
  ) {
    throw socialError("ERR_SOCIAL_LOGIN_INVALID");
  }
  const token = await clerk.session.getToken({ skipCache: true });
  if (!token) throw socialError("ERR_SOCIAL_LOGIN_INVALID");
  // Consume before exchange: a callback cannot silently log in again on reload.
  clearGoogleIntent();
  await exchange(token);
}

export async function signOutGoogle() {
  clearGoogleIntent();
  if (clerkPromise) {
    const clerk = await clerkPromise;
    await clerk.signOut(() => Promise.resolve());
  }
}
