import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import {
  defaultModelPreferences,
  modelWorkloads,
  type ModelPreferences,
  type ModelWorkload,
} from "@open-deutsch/domain";
import { RotateCcw, Save, UserRound } from "lucide-react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import i18n from "./i18n.js";
import { invokeDesktop, normalizeDesktopError, subscribeDesktop } from "./ipc.js";
import {
  desktopSettingsAdapter,
  replaceWorkloadPreference,
  type DesktopSettingsAdapter,
  type DesktopSettingsResult,
  type DesktopSettingsValue,
} from "./settings-adapter.js";

type Readiness = Extract<DesktopIpcResponse, { status: "ok"; channel: "app/readiness" }>["result"];
type Account = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "codex/account/read" }
>["result"];
type Catalog = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "codex/models/read" }
>["result"];
type Limits = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "codex/rate-limits/read" }
>["result"];
type DataRootSelection = Extract<
  Extract<DesktopIpcResponse, { status: "ok"; channel: "data-root/choose" }>["result"],
  { status: "selected" }
>;
type Diagnostics = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "diagnostics/read" }
>["result"];
type DiagnosticsExport = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "diagnostics/export" }
>["result"];

const dataRootWarningKeys = {
  "git-worktree": "folder.warningGit",
  "broad-permissions": "folder.warningBroad",
  "install-directory": "folder.warningInstall",
  "integration-restart-required": "folder.warningRestart",
} as const;

function SettingsError({ error }: { error: OpenDeutschError }) {
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

function modelValue(preference: ModelPreferences[ModelWorkload]): string {
  return preference.model.mode === "automatic" ? "automatic" : `exact:${preference.model.modelId}`;
}

function effortValue(preference: ModelPreferences[ModelWorkload]): string {
  return preference.effort.mode === "semantic"
    ? `semantic:${preference.effort.effort}`
    : `exact:${preference.effort.effortId}`;
}

export function SettingsPage({
  readiness,
  adapter = desktopSettingsAdapter,
  onDataRootChanged = () => {
    window.location.reload();
  },
}: {
  readiness: Readiness;
  adapter?: DesktopSettingsAdapter;
  onDataRootChanged?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [account, setAccount] = useState<Account>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [limits, setLimits] = useState<Limits>();
  const [persisted, setPersisted] = useState<DesktopSettingsResult>();
  const [draft, setDraft] = useState<DesktopSettingsValue>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const [notice, setNotice] = useState<string>();
  const [dataRootSelection, setDataRootSelection] = useState<DataRootSelection>();
  const [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const [integration, setIntegration] = useState(readiness.codex);

  const refreshRuntime = useCallback(async () => {
    const [accountResult, catalogResult, limitsResult] = await Promise.allSettled([
      invokeDesktop("codex/account/read", {}),
      invokeDesktop("codex/models/read", {}),
      invokeDesktop("codex/rate-limits/read", {}),
    ]);
    if (accountResult.status === "fulfilled") setAccount(accountResult.value);
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
    if (limitsResult.status === "fulfilled") setLimits(limitsResult.value);
    const failure = [accountResult, catalogResult, limitsResult].find(
      (result) => result.status === "rejected",
    );
    if (failure?.status === "rejected") setError(normalizeDesktopError(failure.reason).detail);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const [accountResult, catalogResult, limitsResult, settingsResult] = await Promise.allSettled([
      invokeDesktop("codex/account/read", {}),
      invokeDesktop("codex/models/read", {}),
      invokeDesktop("codex/rate-limits/read", {}),
      adapter.available() ? adapter.read() : Promise.resolve(undefined),
    ]);
    if (accountResult.status === "fulfilled") setAccount(accountResult.value);
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
    if (limitsResult.status === "fulfilled") setLimits(limitsResult.value);
    if (settingsResult.status === "fulfilled" && settingsResult.value) {
      setPersisted(settingsResult.value);
      setDraft(settingsResult.value.settings);
    }
    const failure = [accountResult, catalogResult, limitsResult, settingsResult].find(
      (result) => result.status === "rejected",
    );
    if (failure?.status === "rejected") setError(normalizeDesktopError(failure.reason).detail);
    setLoading(false);
  }, [adapter]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const unsubscribe = subscribeDesktop((event) => {
      if (
        event.event === "account-login" &&
        ["complete", "cancelled", "failed"].includes(event.state.status)
      ) {
        void refreshRuntime();
      } else if (
        event.event === "state-invalidated" &&
        ["account", "models", "rate-limits"].includes(event.scope)
      ) {
        void refreshRuntime();
      }
    });
    return () => {
      window.clearTimeout(initialLoad);
      unsubscribe();
    };
  }, [load, refreshRuntime]);

  const dirty = useMemo(
    () =>
      Boolean(draft && persisted && JSON.stringify(draft) !== JSON.stringify(persisted.settings)),
    [draft, persisted],
  );

  const save = async () => {
    if (!draft || !persisted || !dirty) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await adapter.update(persisted.updatedAt, draft);
      setPersisted(next);
      setDraft(next.settings);
      await i18n.changeLanguage(next.settings.uiLocale);
      setNotice(t("settings.saved"));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    setBusy(true);
    try {
      await invokeDesktop("codex/account/login/start", { method: "browser" });
      setNotice(t("settings.loginStarted"));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      setAccount(await invokeDesktop("codex/account/logout", {}));
      setLimits(undefined);
      setNotice(t("settings.loggedOut"));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const manageIntegration = async (action: "install" | "refresh" | "uninstall") => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await invokeDesktop("codex/integration/action", { action });
      setIntegration(result.status);
      setNotice(result.steps.at(-1));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const chooseDataRoot = async () => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await invokeDesktop("data-root/choose", {
        ...(persisted ? { expectedGeneration: persisted.dataRoot.generation } : {}),
      });
      if (result.status === "selected") setDataRootSelection(result);
      else setNotice(t("settings.dataSwitchCancelled"));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const confirmDataRoot = async () => {
    if (!dataRootSelection) return;
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("data-root/confirm", { selectionId: dataRootSelection.selectionId });
      await onDataRootChanged();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const readDiagnostics = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setDiagnostics(await invokeDesktop("diagnostics/read", {}));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const clearLogs = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await invokeDesktop("logs/clear", {});
      setDiagnostics((current) => (current ? { ...current, logFileCount: 0 } : current));
      setNotice(t("settings.logsCleared", { count: result.clearedFileCount }));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const exportDiagnostics = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result: DiagnosticsExport = await invokeDesktop("diagnostics/export", {});
      if (result.status === "exported") setNotice(t("settings.diagnosticsExported", result));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const setProfile = <Key extends keyof DesktopSettingsValue>(
    key: Key,
    value: DesktopSettingsValue[Key],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const setModel = (workload: ModelWorkload, value: string) => {
    if (!draft) return;
    const current = draft.modelPreferences[workload];
    const model =
      value === "automatic"
        ? { mode: "automatic" as const }
        : { mode: "exact" as const, modelId: value.slice(6) };
    setProfile(
      "modelPreferences",
      replaceWorkloadPreference(draft.modelPreferences, workload, { ...current, model }),
    );
  };

  const setEffort = (workload: ModelWorkload, value: string) => {
    if (!draft) return;
    const current = draft.modelPreferences[workload];
    const effort = value.startsWith("semantic:")
      ? { mode: "semantic" as const, effort: value.slice(9) as "fast" | "balanced" | "deep" }
      : { mode: "exact" as const, effortId: value.slice(6) };
    setProfile(
      "modelPreferences",
      replaceWorkloadPreference(draft.modelPreferences, workload, { ...current, effort }),
    );
  };

  return (
    <section className={`${styles.page} ${styles.settingsPage}`}>
      <p className={styles.eyebrow}>{t("settings.eyebrow")}</p>
      <h1>{t("settings.title")}</h1>
      <p className={styles.lead}>{t("settings.intro")}</p>
      {loading && <p role="status">{t("settings.loading")}</p>}
      {error && <SettingsError error={error} />}
      {notice && (
        <p className={`${styles.status} ${styles.success}`} role="status">
          {notice}
        </p>
      )}

      <div className={styles.settingsGrid}>
        <section className={styles.settingsSection} aria-labelledby="settings-data-title">
          <h2 id="settings-data-title">{t("settings.dataTitle")}</h2>
          {readiness.dataRoot.status === "ready" && (
            <dl className={styles.detailList}>
              <div>
                <dt>{t("settings.dataFolder")}</dt>
                <dd>{readiness.dataRoot.displayName}</dd>
              </div>
              <div>
                <dt>{t("settings.generation")}</dt>
                <dd>{readiness.dataRoot.generation}</dd>
              </div>
            </dl>
          )}
          {!dataRootSelection ? (
            <Button
              className={styles.secondary}
              isDisabled={busy}
              onPress={() => void chooseDataRoot()}
            >
              {t("settings.dataSwitch")}
            </Button>
          ) : (
            <div
              className={styles.switchConfirmation}
              role="group"
              aria-label={t("settings.dataSwitchConfirmTitle")}
            >
              <p>
                {t("settings.dataSwitchConfirm", {
                  name: dataRootSelection.displayName,
                  generation: dataRootSelection.generation,
                })}
              </p>
              {dataRootSelection.warnings.length > 0 && (
                <ul className={styles.compactList}>
                  {dataRootSelection.warnings.map((warning) => (
                    <li key={warning}>{t(dataRootWarningKeys[warning])}</li>
                  ))}
                </ul>
              )}
              <div className={styles.buttonRow}>
                <Button
                  className={styles.primary}
                  isDisabled={busy}
                  onPress={() => void confirmDataRoot()}
                >
                  {t("settings.dataSwitchConfirmAction")}
                </Button>
                <Button
                  className={styles.secondary}
                  isDisabled={busy}
                  onPress={() => {
                    setDataRootSelection(undefined);
                  }}
                >
                  {t("actions.cancel")}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className={styles.settingsSection} aria-labelledby="settings-account-title">
          <h2 id="settings-account-title">{t("settings.accountTitle")}</h2>
          <p>{account ? t(`settings.account.${account.status}`) : t("settings.notReported")}</p>
          {account?.status === "signed-in" && account.planType && (
            <p>{t("settings.plan", { plan: account.planType })}</p>
          )}
          <div className={styles.buttonRow}>
            {account?.status === "signed-in" ? (
              <Button className={styles.secondary} isDisabled={busy} onPress={() => void logout()}>
                {t("settings.logout")}
              </Button>
            ) : (
              <Button
                className={styles.primary}
                isDisabled={busy || readiness.codex.status !== "available"}
                onPress={() => void login()}
              >
                <UserRound aria-hidden="true" />
                {t("settings.login")}
              </Button>
            )}
          </div>
          <p>
            {integration.status === "available"
              ? t("settings.codexVersion", { version: integration.codexVersion })
              : t("settings.codexUnavailable")}
          </p>
          {integration.status === "available" && (
            <>
              <p>{t(`settings.plugin.${integration.plugin}`)}</p>
              <div className={styles.buttonRow}>
                {integration.plugin === "not-installed" && (
                  <Button
                    className={styles.primary}
                    isDisabled={busy}
                    onPress={() => void manageIntegration("install")}
                  >
                    {t("settings.plugin.actions.install")}
                  </Button>
                )}
                {integration.plugin === "refresh-required" && (
                  <Button
                    className={styles.primary}
                    isDisabled={busy}
                    onPress={() => void manageIntegration("refresh")}
                  >
                    {t("settings.plugin.actions.refresh")}
                  </Button>
                )}
                {integration.plugin === "installed" && (
                  <Button
                    className={styles.secondary}
                    isDisabled={busy}
                    onPress={() => void manageIntegration("uninstall")}
                  >
                    {t("settings.plugin.actions.uninstall")}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>

        <section className={styles.settingsSection} aria-labelledby="settings-limits-title">
          <h2 id="settings-limits-title">{t("settings.limitsTitle")}</h2>
          {limits && (limits.status === "available" || limits.status === "limited") ? (
            <ul className={styles.compactList}>
              {limits.buckets.map((bucket) => (
                <li key={bucket.limitId}>
                  <strong>{bucket.limitId}</strong>
                  {bucket.primary?.usedPercent == null
                    ? ""
                    : ` · ${String(bucket.primary.usedPercent)}%`}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{t("settings.notReported")}</p>
          )}
        </section>

        <section className={styles.settingsSection} aria-labelledby="settings-privacy-title">
          <h2 id="settings-privacy-title">{t("settings.privacyTitle")}</h2>
          <p>
            <strong>{t("folder.privacyTitle")}</strong> — {t("folder.privacyBody")}
          </p>
          <p>
            <strong>{t("folder.cloudTitle")}</strong> — {t("folder.cloudBody")}
          </p>
        </section>
      </div>

      <section className={styles.settingsSection} aria-labelledby="settings-profile-title">
        <h2 id="settings-profile-title">{t("settings.profileTitle")}</h2>
        {!draft ? (
          <p className={styles.muted}>{t("settings.persistenceUnavailable")}</p>
        ) : (
          <div className={styles.settingsControls}>
            <label className={styles.controlLabel}>
              <span>{t("onboarding.level")}</span>
              <select
                value={draft.approximateLevel}
                onChange={(event) => {
                  setProfile(
                    "approximateLevel",
                    event.currentTarget.value as DesktopSettingsValue["approximateLevel"],
                  );
                }}
              >
                {["a1", "a2", "b1", "b2"].map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.controlLabel}>
              <span>{t("onboarding.goal")}</span>
              <textarea
                rows={3}
                maxLength={500}
                value={draft.everydayGermanyGoal}
                onChange={(event) => {
                  setProfile("everydayGermanyGoal", event.currentTarget.value);
                }}
              />
            </label>
            <label className={styles.controlLabel}>
              <span>{t("onboarding.time")}</span>
              <input
                type="number"
                min={15}
                max={10080}
                value={draft.availableStudyMinutesPerWeek}
                onChange={(event) => {
                  setProfile("availableStudyMinutesPerWeek", Number(event.currentTarget.value));
                }}
              />
            </label>
            <label className={styles.controlLabel}>
              <span>{t("settings.teachingProfile")}</span>
              <select
                value={draft.defaultTeachingProfileId}
                onChange={(event) => {
                  setProfile(
                    "defaultTeachingProfileId",
                    event.currentTarget.value as DesktopSettingsValue["defaultTeachingProfileId"],
                  );
                }}
              >
                <option value="conversation-partner">
                  {t("onboarding.profiles.conversation-partner.title")}
                </option>
                <option value="strict-corrector">
                  {t("onboarding.profiles.strict-corrector.title")}
                </option>
              </select>
            </label>
            <label className={styles.controlLabel}>
              <span>{t("onboarding.explanationLanguage")}</span>
              <select
                value={draft.explanationLanguage}
                onChange={(event) => {
                  setProfile("explanationLanguage", event.currentTarget.value as "en" | "de");
                }}
              >
                <option value="en">{t("onboarding.languages.en")}</option>
                <option value="de">{t("onboarding.languages.de")}</option>
              </select>
            </label>
            <label className={styles.controlLabel}>
              <span>{t("settings.uiLocale")}</span>
              <select
                aria-label={t("settings.uiLocale")}
                value={draft.uiLocale}
                onChange={(event) => {
                  setProfile("uiLocale", event.currentTarget.value as "en" | "de");
                }}
              >
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
              <small>{t("settings.localeSeparate")}</small>
            </label>
          </div>
        )}
      </section>

      <section className={styles.settingsSection} aria-labelledby="settings-models-title">
        <h2 id="settings-models-title">{t("settings.modelsTitle")}</h2>
        {!draft ? (
          <p className={styles.muted}>{t("settings.persistenceUnavailable")}</p>
        ) : (
          modelWorkloads.map((workload) => {
            const preference = draft.modelPreferences[workload];
            const savedModelId =
              preference.model.mode === "exact" ? preference.model.modelId : undefined;
            const selectedModel = savedModelId
              ? catalog?.models.find(({ id }) => id === savedModelId)
              : catalog?.models.find(({ isDefault }) => isDefault);
            const efforts = selectedModel?.supportedReasoningEfforts ?? [];
            const unavailableModelId = savedModelId && !selectedModel ? savedModelId : undefined;
            const savedEffortId =
              preference.effort.mode === "exact" ? preference.effort.effortId : undefined;
            const unavailableEffortId =
              savedEffortId && (!selectedModel || !efforts.includes(savedEffortId))
                ? savedEffortId
                : undefined;
            return (
              <fieldset className={styles.modelRow} key={workload}>
                <legend>{t(`settings.workloads.${workload}`)}</legend>
                <label className={styles.controlLabel}>
                  <span>{t("settings.model")}</span>
                  <select
                    value={modelValue(preference)}
                    onChange={(event) => {
                      setModel(workload, event.currentTarget.value);
                    }}
                  >
                    <option value="automatic">{t("settings.automatic")}</option>
                    {unavailableModelId ? (
                      <option value={`exact:${unavailableModelId}`}>
                        {t("settings.unavailableSavedModel", { model: unavailableModelId })}
                      </option>
                    ) : null}
                    {catalog?.models.map((model) => (
                      <option key={model.id} value={`exact:${model.id}`}>
                        {model.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.controlLabel}>
                  <span>{t("settings.effort")}</span>
                  <select
                    value={effortValue(preference)}
                    onChange={(event) => {
                      setEffort(workload, event.currentTarget.value);
                    }}
                  >
                    {(["fast", "balanced", "deep"] as const).map((effort) => (
                      <option key={effort} value={`semantic:${effort}`}>
                        {t(`settings.efforts.${effort}`)}
                      </option>
                    ))}
                    {unavailableEffortId ? (
                      <option value={`exact:${unavailableEffortId}`}>
                        {t("settings.unavailableSavedEffort", { effort: unavailableEffortId })}
                      </option>
                    ) : null}
                    {efforts.map((effort) => (
                      <option key={effort} value={`exact:${effort}`}>
                        {t("settings.exactEffort", { effort })}
                      </option>
                    ))}
                  </select>
                </label>
                {unavailableModelId || unavailableEffortId ? (
                  <p className={`${styles.status} ${styles.warning}`} role="status">
                    {t("settings.savedModelFallback")}
                  </p>
                ) : null}
              </fieldset>
            );
          })
        )}
      </section>

      <section className={styles.settingsSection} aria-labelledby="settings-diagnostics-title">
        <h2 id="settings-diagnostics-title">{t("settings.diagnosticsTitle")}</h2>
        <p className={styles.muted}>{t("settings.diagnosticsPrivacy")}</p>
        {diagnostics && (
          <dl className={styles.detailList}>
            <div>
              <dt>{t("settings.diagnosticsGeneration")}</dt>
              <dd>{diagnostics.dataRootGeneration}</dd>
            </div>
            <div>
              <dt>{t("settings.diagnosticsSchema")}</dt>
              <dd>{diagnostics.databaseSchemaVersion}</dd>
            </div>
            <div>
              <dt>{t("settings.diagnosticsDatabase")}</dt>
              <dd>{diagnostics.journalMode.toUpperCase()}</dd>
            </div>
            <div>
              <dt>{t("settings.diagnosticsLogs")}</dt>
              <dd>{diagnostics.logFileCount}</dd>
            </div>
          </dl>
        )}
        <div className={styles.buttonRow}>
          <Button
            className={styles.secondary}
            isDisabled={busy}
            onPress={() => void readDiagnostics()}
          >
            {t("settings.runDiagnostics")}
          </Button>
          <Button
            className={styles.secondary}
            isDisabled={busy}
            onPress={() => void exportDiagnostics()}
          >
            {t("settings.exportDiagnostics")}
          </Button>
          <Button className={styles.secondary} isDisabled={busy} onPress={() => void clearLogs()}>
            {t("settings.clearLogs")}
          </Button>
        </div>
      </section>

      {draft && (
        <div className={styles.settingsActions}>
          <Button
            className={styles.secondary}
            isDisabled={busy}
            onPress={() => {
              setProfile("modelPreferences", defaultModelPreferences);
            }}
          >
            <RotateCcw aria-hidden="true" />
            {t("settings.restoreModels")}
          </Button>
          <Button
            className={styles.secondary}
            isDisabled={busy || !persisted}
            onPress={() => {
              if (persisted) setDraft(persisted.settings);
            }}
          >
            {t("settings.discard")}
          </Button>
          <Button
            className={styles.primary}
            isDisabled={busy || !dirty}
            onPress={() => void save()}
          >
            <Save aria-hidden="true" />
            {t("settings.save")}
          </Button>
        </div>
      )}
    </section>
  );
}
