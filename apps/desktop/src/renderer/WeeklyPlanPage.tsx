import { useCallback, useEffect, useState } from "react";
import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import { weeklyPlanCandidateSchema } from "@open-deutsch/contracts";
import { CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import {
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
  createDesktopSubmissionId,
} from "./ipc.js";
import { SurfaceCard } from "./components/Foundation.js";

type WeeklyPlanResult = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "weekly-plan/read" }
>["result"];
type WeeklyPlan = NonNullable<WeeklyPlanResult["plan"]>;
type WeeklyPlanRecommendation = NonNullable<WeeklyPlanResult["recommendation"]>;
export function WeeklyPlanPage({ requestAiAccess }: { requestAiAccess: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [recommendation, setRecommendation] = useState<WeeklyPlanRecommendation | null>(null);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const refresh = useCallback(async () => {
    setError(undefined);
    try {
      const result = await invokeDesktop("weekly-plan/read", {});
      setPlan(result.plan);
      setRecommendation(result.recommendation);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const generate = async () => {
    if (!(await requestAiAccess())) return;
    setBusy(true);
    setError(undefined);
    const submissionId = createDesktopSubmissionId();
    try {
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = subscribeDesktop((event) => {
          if (
            event.event !== "learning-operation-finished" ||
            event.kind !== "weekly-plan-generation" ||
            event.submissionId !== submissionId
          ) {
            return;
          }
          unsubscribe();
          if (event.outcome.status === "validated") {
            weeklyPlanCandidateSchema.parse(event.outcome.output);
            resolve();
          } else {
            reject(new Error(`OD_WEEKLY_PLAN_${event.outcome.status}`));
          }
        });
        void invokeDesktop("learning-operation/start", {
          submissionId,
          input: {
            kind: "weekly-plan-generation",
            ...(request.trim() ? { naturalRequest: request.trim() } : {}),
          },
        }).catch((cause: unknown) => {
          unsubscribe();
          reject(cause instanceof Error ? cause : new Error("OD_WEEKLY_PLAN_FAILED"));
        });
      });
      setRequest("");
      await refresh();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.dashboardHeading}>
        <div>
          <p className={styles.eyebrow}>{t("weeklyPlan.eyebrow")}</p>
          <h1 className={styles.hero}>{t("weeklyPlan.title")}</h1>
          <p className={styles.lead}>{t("weeklyPlan.body")}</p>
        </div>
        <Button className={styles.secondary} isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" /> {t("weeklyPlan.refresh")}
        </Button>
      </div>
      {error && (
        <div className={`${styles.status} ${styles.error}`} role="alert">
          {t(error.messageKey)}
        </div>
      )}
      <SurfaceCard>
        <div className={styles.dashboardHeading}>
          <div>
            <h2>{t("weeklyPlan.generateTitle")}</h2>
            <p>{t("weeklyPlan.generateBody")}</p>
          </div>
          <Sparkles aria-hidden="true" />
        </div>
        <label className={styles.controlLabel}>
          {t("weeklyPlan.request")}
          <textarea
            value={request}
            onChange={(event) => {
              setRequest(event.target.value);
            }}
            placeholder={t("weeklyPlan.requestPlaceholder")}
            rows={3}
          />
        </label>
        <Button className={styles.primary} isDisabled={busy} onPress={() => void generate()}>
          {busy ? t("weeklyPlan.generating") : t("weeklyPlan.generate")}
        </Button>
      </SurfaceCard>

      {plan ? (
        <SurfaceCard>
          <div className={styles.historyEntryHeader}>
            <div>
              <h2>{t("weeklyPlan.current")}</h2>
              <p className={styles.muted}>
                {t("weeklyPlan.week", { date: plan.weekStartsOn })} · {t("weeklyPlan.advisory")}
              </p>
            </div>
            <CalendarDays aria-hidden="true" />
          </div>
          {recommendation && (
            <section
              className={styles.settingsSection}
              aria-labelledby="weekly-plan-recommendation"
            >
              <h3 id="weekly-plan-recommendation">{t("weeklyPlan.recommendedTitle")}</h3>
              <p>{t("weeklyPlan.recommendedBody")}</p>
              <p>
                <strong>{recommendation.primary.title}</strong> ·{" "}
                {recommendation.primary.estimatedMinutes} min
              </p>
              <p className={styles.muted}>{recommendation.primary.rationale}</p>
              {recommendation.alternatives.length > 0 && (
                <>
                  <h4>{t("weeklyPlan.alternatives")}</h4>
                  <ul className={styles.compactList}>
                    {recommendation.alternatives.map((activity) => (
                      <li key={activity.title}>
                        <strong>{activity.title}</strong> · {activity.estimatedMinutes} min
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          {plan.goals.map((goal) => (
            <section key={goal.title} className={styles.settingsSection}>
              <h3>{goal.title}</h3>
              <p>{goal.outcome}</p>
              <ul className={styles.compactList}>
                {goal.suggestedActivities.map((activity) => (
                  <li key={`${goal.title}:${activity.title}`}>
                    <strong>{activity.title}</strong> · {activity.estimatedMinutes} min
                    <p className={styles.muted}>{activity.rationale}</p>
                    <p>{activity.naturalRequest}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className={styles.muted}>{t("weeklyPlan.noCompletionLedger")}</p>
        </SurfaceCard>
      ) : (
        <SurfaceCard>
          <p>{t("weeklyPlan.empty")}</p>
        </SurfaceCard>
      )}
    </section>
  );
}
