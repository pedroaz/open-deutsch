import { useCallback, useEffect, useState } from "react";
import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import {
  BookOpen,
  CalendarDays,
  FilePenLine,
  History,
  LibraryBig,
  RefreshCw,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DiagnosticCode, Button, Card, Feedback, Muted, ItemList } from "./components/ui/index.js";
import { ActionGroup, Page, ContentGrid } from "./components/layout/index.js";

import styles from "./Dashboard.module.css";
import { invokeDesktop, normalizeDesktopError, subscribeDesktop } from "./ipc.js";

type Snapshot = Extract<DesktopIpcResponse, { status: "ok"; channel: "dashboard/read" }>["result"];
type Destination = "writing" | "practice" | "vocabulary" | "weeklyPlan" | "history";

function EmptyCard({ children }: { children: string }) {
  return <Muted as="p">{children}</Muted>;
}

export function Dashboard({
  onAi,
  onNavigate,
}: {
  onAi: () => void;
  onNavigate: (destination: Destination) => void;
}) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setSnapshot(await invokeDesktop("dashboard/read", {}));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "state-invalidated" && event.scope === "dashboard") void refresh();
    });
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [refresh]);

  return (
    <Page
      actions={
        <Button isPending={busy} pendingLabel={t("dashboard.refreshing")} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" />
          {t("dashboard.refresh")}
        </Button>
      }
      description={t("dashboard.body")}
      eyebrow={t("dashboard.eyebrow")}
      title={t("dashboard.title")}
    >
      {error && (
        <Feedback live="assertive" tone="error">
          <p>{t(error.messageKey)}</p>
          <DiagnosticCode>
            {error.reference.code} · {error.reference.correlationId}
          </DiagnosticCode>
        </Feedback>
      )}
      <ActionGroup>
        <Button
          variant="primary"
          onPress={() => {
            onNavigate("practice");
          }}
        >
          <FilePenLine aria-hidden="true" /> {t("dashboard.primary")}
        </Button>
        <Button onPress={onAi}>
          <Sparkles aria-hidden="true" />
          {t("actions.startAi")}
        </Button>
      </ActionGroup>

      <ContentGrid fillLast aria-busy={busy}>
        <Card as="article">
          <CalendarDays aria-hidden="true" />
          <h2>{t("dashboard.cards.plan")}</h2>
          {snapshot?.weeklyPlan ? (
            <>
              <p>{t("dashboard.planWeek", { date: snapshot.weeklyPlan.weekStartsOn })}</p>
              <ItemList>
                {snapshot.weeklyPlan.goalTitles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ItemList>
            </>
          ) : (
            <EmptyCard>{t("dashboard.emptyPlan")}</EmptyCard>
          )}
          <Button

            onPress={() => {
              onNavigate("weeklyPlan");
            }}
          >
            {t("dashboard.openPlan")}
          </Button>
        </Card>

        <Card as="article">
          <BookOpen aria-hidden="true" />
          <h2>{t("dashboard.cards.quickPractice")}</h2>
          <p>{t("dashboard.quickPracticeBody")}</p>
          <ActionGroup>
            <Button

              onPress={() => {
                onNavigate("practice");
              }}
            >
              {t("dashboard.openPractice")}
            </Button>
            <Button

              onPress={() => {
                onNavigate("writing");
              }}
            >
              {t("dashboard.openWriting")}
            </Button>
          </ActionGroup>
        </Card>

        <Card as="article">
          <History aria-hidden="true" />
          <h2>{t("dashboard.cards.corrections")}</h2>
          {snapshot && snapshot.recentCorrections.length > 0 ? (
            <ItemList>
              {snapshot.recentCorrections.map((correction) => (
                <li key={correction.correctionId}>
                  {t("dashboard.correctionItem", {
                    count: correction.changedSegmentCount,
                    date: correction.createdAt.slice(0, 10),
                  })}
                </li>
              ))}
            </ItemList>
          ) : (
            <EmptyCard>{t("dashboard.emptyCorrections")}</EmptyCard>
          )}
          <Button

            onPress={() => {
              onNavigate("history");
            }}
          >
            {t("dashboard.openHistory")}
          </Button>
        </Card>

        <Card as="article">
          <Repeat2 aria-hidden="true" />
          <h2>{t("dashboard.cards.mistakes")}</h2>
          {snapshot && snapshot.recurringMistakes.length > 0 ? (
            <ItemList>
              {snapshot.recurringMistakes.map((mistake) => (
                <li key={mistake.mistakeId}>
                  {t("dashboard.mistakeItem", {
                    category:
                      mistake.category.kind === "vocabulary"
                        ? mistake.category.lemma
                        : mistake.category.categoryKey,
                    count: mistake.occurrenceCount,
                  })}
                </li>
              ))}
            </ItemList>
          ) : (
            <EmptyCard>{t("dashboard.emptyMistakes")}</EmptyCard>
          )}
        </Card>

        <Card as="article">
          <LibraryBig aria-hidden="true" />
          <h2>{t("dashboard.cards.vocabulary")}</h2>
          {snapshot && snapshot.dueVocabulary.length > 0 ? (
            <ItemList>
              {snapshot.dueVocabulary.map((entry) => (
                <li key={entry.vocabularyId}>
                  <strong>{entry.lemma}</strong> — {entry.meaning}
                </li>
              ))}
            </ItemList>
          ) : (
            <EmptyCard>{t("dashboard.emptyVocabulary")}</EmptyCard>
          )}
          <Button

            onPress={() => {
              onNavigate("vocabulary");
            }}
          >
            {t("dashboard.openVocabulary")}
          </Button>
        </Card>

      </ContentGrid>
      {snapshot && (
        <p className={styles.refreshStamp} role="status">
          {t("dashboard.refreshed", { time: snapshot.refreshedAt.slice(11, 16) })}
        </p>
      )}
    </Page>
  );
}
