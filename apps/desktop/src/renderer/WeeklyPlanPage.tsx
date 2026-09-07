import { useCallback, useEffect, useState } from "react";
import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import { weeklyPlanCandidateSchema } from "@open-deutsch/contracts";
import { CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Feedback, FieldGroup, Muted, ItemList } from "./components/ui/index.js";
import { SectionHeader, Page } from "./components/layout/index.js";

import styles from "./WeeklyPlanPage.module.css";
import {
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
  createDesktopSubmissionId,
} from "./ipc.js";

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
    <Page
      actions={
        <Button isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" /> {t("weeklyPlan.refresh")}
        </Button>
      }
      description={t("weeklyPlan.body")}
      eyebrow={t("weeklyPlan.eyebrow")}
      title={t("weeklyPlan.title")}
    >
      {error && <Feedback live="assertive" tone="error">{t(error.messageKey)}</Feedback>}
      <Card as="article">
        <SectionHeader>
          <div>
            <h2>{t("weeklyPlan.generateTitle")}</h2>
            <p>{t("weeklyPlan.generateBody")}</p>
          </div>
          <Sparkles aria-hidden="true" />
        </SectionHeader>
        <FieldGroup>
          {t("weeklyPlan.request")}
          <textarea
            value={request}
            onChange={(event) => {
              setRequest(event.target.value);
            }}
            placeholder={t("weeklyPlan.requestPlaceholder")}
            rows={3}
          />
        </FieldGroup>
        <Button isPending={busy} pendingLabel={t("weeklyPlan.generating")} variant="primary" onPress={() => void generate()}>
          {t("weeklyPlan.generate")}
        </Button>
      </Card>

      {plan ? (
        <Card as="article">
          <SectionHeader>
            <div>
              <h2>{t("weeklyPlan.current")}</h2>
              <Muted as="p">
                {t("weeklyPlan.week", { date: plan.weekStartsOn })} · {t("weeklyPlan.advisory")}
              </Muted>
            </div>
            <CalendarDays aria-hidden="true" />
          </SectionHeader>
          {recommendation && (
            <Card as="section"
              aria-labelledby="weekly-plan-recommendation"
            >
              <h3 id="weekly-plan-recommendation">{t("weeklyPlan.recommendedTitle")}</h3>
              <p>{t("weeklyPlan.recommendedBody")}</p>
              <p>
                <strong>{recommendation.primary.title}</strong> ·{" "}
                {recommendation.primary.estimatedMinutes} min
              </p>
              <Muted as="p">{recommendation.primary.rationale}</Muted>
              {recommendation.alternatives.length > 0 && (
                <>
                  <h4>{t("weeklyPlan.alternatives")}</h4>
                  <ItemList>
                    {recommendation.alternatives.map((activity) => (
                      <li key={activity.title}>
                        <strong>{activity.title}</strong> · {activity.estimatedMinutes} min
                      </li>
                    ))}
                  </ItemList>
                </>
              )}
            </Card>
          )}
          {plan.goals.map((goal) => (
            <Card as="section" key={goal.title}>
              <h3>{goal.title}</h3>
              <p>{goal.outcome}</p>
              <ItemList>
                {goal.suggestedActivities.map((activity) => (
                  <li key={`${goal.title}:${activity.title}`}>
                    <strong>{activity.title}</strong> · {activity.estimatedMinutes} min
                    <Muted as="p">{activity.rationale}</Muted>
                    <p>{activity.naturalRequest}</p>
                  </li>
                ))}
              </ItemList>
            </Card>
          ))}
          <Muted as="p">{t("weeklyPlan.noCompletionLedger")}</Muted>
        </Card>
      ) : (
        <Card as="article">
          <p>{t("weeklyPlan.empty")}</p>
        </Card>
      )}
    </Page>
  );
}
