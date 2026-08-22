import { useCallback, useEffect, useState } from "react";
import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import { Languages, UserRound } from "lucide-react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import i18n from "./i18n.js";
import { invokeDesktop, normalizeDesktopError, subscribeDesktop } from "./ipc.js";

type Readiness = Extract<DesktopIpcResponse, { status: "ok"; channel: "app/readiness" }>["result"];
type AccountState = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "codex/account/read" }
>["result"];
type LoginId = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "codex/account/login/start" }
>["result"]["loginId"];

function AccountError({ error }: { error: OpenDeutschError }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.status} ${styles.error}`} role="alert">
      <div>
        <p>{t(error.messageKey)}</p>
        <code className={styles.diagnostic}>
          {t("startup.diagnostic")}: {error.reference.code} · {error.reference.correlationId}
        </code>
      </div>
    </div>
  );
}

export function ProfileOnboarding({
  readiness,
  onComplete,
}: {
  readiness: Readiness;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const [account, setAccount] = useState<AccountState>({
    status: "unavailable",
    reason: "runtime-not-ready",
  });
  const [loginId, setLoginId] = useState<LoginId>();
  const [loginStatus, setLoginStatus] = useState<string>();
  const [accountError, setAccountError] = useState<OpenDeutschError>();
  const [saveError, setSaveError] = useState<OpenDeutschError>();
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<"a1" | "a2" | "b1" | "b2">("a2");
  const [minutes, setMinutes] = useState("90");
  const [teachingProfile, setTeachingProfile] = useState<
    "conversation-partner" | "strict-corrector"
  >("conversation-partner");
  const [explanationLanguage, setExplanationLanguage] = useState<"en" | "de">("en");
  const [skipPlacement, setSkipPlacement] = useState(true);
  const [busy, setBusy] = useState(false);

  const readAccount = useCallback(async () => {
    try {
      setAccount(await invokeDesktop("codex/account/read", {}));
      setAccountError(undefined);
    } catch (cause) {
      setAccountError(normalizeDesktopError(cause).detail);
    }
  }, []);

  useEffect(() => {
    const initialRead = window.setTimeout(() => void readAccount(), 0);
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event !== "account-login" || event.loginId !== loginId) return;
      setLoginStatus(event.state.status);
      if (event.state.status === "failed") setAccountError(event.state.error);
      if (event.state.status === "complete") void readAccount();
      if (["complete", "cancelled", "failed"].includes(event.state.status)) {
        setLoginId(undefined);
      }
    });
    return () => {
      window.clearTimeout(initialRead);
      unsubscribe();
    };
  }, [loginId, readAccount]);

  const connect = async (method: "browser" | "device-code") => {
    setBusy(true);
    setAccountError(undefined);
    try {
      const result = await invokeDesktop("codex/account/login/start", { method });
      setLoginId(result.loginId);
      setLoginStatus("waiting");
    } catch (cause) {
      setAccountError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const cancelLogin = async () => {
    if (!loginId) return;
    setBusy(true);
    try {
      await invokeDesktop("codex/account/login/cancel", { loginId });
      setLoginId(undefined);
      setLoginStatus("cancelled");
    } catch (cause) {
      setAccountError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const accountSummary =
    account.status === "signed-in"
      ? t("onboarding.accountConnected", { plan: account.planType ?? t("onboarding.planUnknown") })
      : account.status === "expired"
        ? t("onboarding.accountExpired")
        : account.status === "signed-out"
          ? t("onboarding.accountSignedOut")
          : account.status === "unsupported"
            ? t("onboarding.accountUnsupported")
            : t("onboarding.accountUnavailable");

  return (
    <div className={styles.app}>
      <div className={styles.topActions}>
        <Button
          className={styles.languageButton}
          onPress={() => void i18n.changeLanguage(i18n.language === "de" ? "en" : "de")}
        >
          <Languages aria-hidden="true" />
          {t("actions.switchLanguage")}
        </Button>
      </div>
      <main className={styles.startup}>
        <form
          className={`${styles.startupCard} ${styles.onboardingCard}`}
          aria-labelledby="profile-onboarding-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (goal.trim().length === 0 || !skipPlacement) return;
            setBusy(true);
            setSaveError(undefined);
            void invokeDesktop("learner-profile/complete-onboarding", {
              approximateLevel: level,
              everydayGermanyGoal: goal.trim(),
              availableStudyMinutesPerWeek: Number(minutes),
              defaultTeachingProfileId: teachingProfile,
              explanationLanguage,
              placement: { status: "skipped" },
            })
              .then(() => {
                onComplete();
              })
              .catch((cause: unknown) => {
                setSaveError(normalizeDesktopError(cause).detail);
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <p className={styles.eyebrow}>{t("onboarding.step")}</p>
          <h1 id="profile-onboarding-title">{t("onboarding.title")}</h1>
          <p className={styles.muted}>{t("onboarding.intro")}</p>

          <fieldset className={styles.onboardingSection}>
            <legend>{t("onboarding.accountTitle")}</legend>
            <p role="status">{accountSummary}</p>
            {loginStatus && <p className={styles.muted}>{t(`onboarding.login.${loginStatus}`)}</p>}
            {accountError && <AccountError error={accountError} />}
            {account.status !== "signed-in" && readiness.codex.status === "available" && (
              <div className={styles.buttonRow}>
                <Button
                  className={styles.primary}
                  isDisabled={busy || Boolean(loginId)}
                  onPress={() => void connect("browser")}
                >
                  <UserRound aria-hidden="true" /> {t("onboarding.connectBrowser")}
                </Button>
                <Button
                  className={styles.secondary}
                  isDisabled={busy || Boolean(loginId)}
                  onPress={() => void connect("device-code")}
                >
                  {t("onboarding.connectDevice")}
                </Button>
                {loginId && (
                  <Button
                    className={styles.secondary}
                    isDisabled={busy}
                    onPress={() => void cancelLogin()}
                  >
                    {t("onboarding.cancelLogin")}
                  </Button>
                )}
              </div>
            )}
          </fieldset>

          <div className={styles.onboardingGrid}>
            <fieldset className={styles.onboardingSection}>
              <legend>{t("onboarding.startTitle")}</legend>
              <label className={styles.controlLabel}>
                <span>{t("onboarding.level")}</span>
                <select
                  value={level}
                  onChange={(event) => {
                    setLevel(event.currentTarget.value as "a1" | "a2" | "b1" | "b2");
                  }}
                >
                  {(["a1", "a2", "b1", "b2"] as const).map((band) => (
                    <option key={band} value={band}>
                      {band.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.controlLabel}>
                <span>{t("onboarding.goal")}</span>
                <textarea
                  aria-label={t("onboarding.goal")}
                  maxLength={500}
                  required
                  rows={3}
                  value={goal}
                  onChange={(event) => {
                    setGoal(event.currentTarget.value);
                  }}
                />
                <small>{t("onboarding.goalHint")}</small>
              </label>
              <label className={styles.controlLabel}>
                <span>{t("onboarding.time")}</span>
                <select
                  value={minutes}
                  onChange={(event) => {
                    setMinutes(event.currentTarget.value);
                  }}
                >
                  {[30, 60, 90, 120, 180].map((value) => (
                    <option key={value} value={value}>
                      {t("onboarding.minutes", { count: value })}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.checkboxRow}>
                <input
                  checked={skipPlacement}
                  onChange={(event) => {
                    setSkipPlacement(event.currentTarget.checked);
                  }}
                  type="checkbox"
                />
                <span>{t("onboarding.skipPlacement")}</span>
              </label>
              {!skipPlacement && <p className={styles.muted}>{t("onboarding.placementLater")}</p>}
            </fieldset>

            <fieldset className={styles.onboardingSection}>
              <legend>{t("onboarding.teachingTitle")}</legend>
              <div className={styles.optionGroup}>
                {(["conversation-partner", "strict-corrector"] as const).map((profile) => (
                  <label key={profile} className={styles.optionCard}>
                    <input
                      aria-label={t(`onboarding.profiles.${profile}.title`)}
                      checked={teachingProfile === profile}
                      name="teaching-profile"
                      onChange={() => {
                        setTeachingProfile(profile);
                      }}
                      type="radio"
                      value={profile}
                    />
                    <span>
                      <strong>{t(`onboarding.profiles.${profile}.title`)}</strong>
                      <small>{t(`onboarding.profiles.${profile}.body`)}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className={styles.controlLegend}>{t("onboarding.explanationLanguage")}</p>
              <div className={styles.optionGroup}>
                {(["en", "de"] as const).map((language) => (
                  <label key={language} className={styles.optionCard}>
                    <input
                      checked={explanationLanguage === language}
                      name="explanation-language"
                      onChange={() => {
                        setExplanationLanguage(language);
                      }}
                      type="radio"
                      value={language}
                    />
                    <span>{t(`onboarding.languages.${language}`)}</span>
                  </label>
                ))}
              </div>
              <p className={styles.muted}>{t("onboarding.localeIndependent")}</p>
            </fieldset>
          </div>

          <div className={styles.buttonRow}>
            {saveError && <AccountError error={saveError} />}
            <Button
              className={styles.primary}
              isDisabled={busy || goal.trim().length === 0 || !skipPlacement}
              type="submit"
            >
              {t("onboarding.finish")}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
