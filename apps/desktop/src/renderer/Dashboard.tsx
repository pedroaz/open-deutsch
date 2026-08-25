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
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import { SurfaceCard } from "./components/Foundation.js";
import { invokeDesktop, normalizeDesktopError, subscribeDesktop } from "./ipc.js";

type Snapshot = Extract<DesktopIpcResponse, { status: "ok"; channel: "dashboard/read" }>["result"];
type Destination = "writing" | "practice" | "vocabulary" | "weeklyPlan" | "history";

function EmptyCard({ children }: { children: string }) {
  return <p className={styles.muted}>{children}</p>;
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
    <section className={styles.page}>
      <div className={styles.dashboardHeading}>
        <div>
          <p className={styles.eyebrow}>{t("dashboard.eyebrow")}</p>
          <h1 className={styles.hero}>{t("dashboard.title")}</h1>
          <p className={styles.lead}>{t("dashboard.body")}</p>
        </div>
        <Button className={styles.secondary} isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" />
          {busy ? t("dashboard.refreshing") : t("dashboard.refresh")}
        </Button>
      </div>
      {error && (
        <div className={`${styles.status} ${styles.error}`} role="alert">
          <p>{t(error.messageKey)}</p>
          <code className={styles.diagnostic}>
            {error.reference.code} · {error.reference.correlationId}
          </code>
        </div>
      )}
      <div className={styles.buttonRow}>
        <Button
          className={styles.primary}
          onPress={() => {
            onNavigate("practice");
          }}
        >
          <FilePenLine aria-hidden="true" /> {t("dashboard.primary")}
        </Button>
        <Button className={styles.secondary} onPress={onAi}>
          <Sparkles aria-hidden="true" />
          {t("actions.startAi")}
        </Button>
      </div>

      <div className={styles.dashboardGrid} aria-busy={busy}>
        <SurfaceCard>
          <CalendarDays aria-hidden="true" />
          <h2>{t("dashboard.cards.plan")}</h2>
          {snapshot?.weeklyPlan ? (
            <>
              <p>{t("dashboard.planWeek", { date: snapshot.weeklyPlan.weekStartsOn })}</p>
              <ul className={styles.compactList}>
                {snapshot.weeklyPlan.goalTitles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyCard>{t("dashboard.emptyPlan")}</EmptyCard>
          )}
          <Button
            className={styles.secondary}
            onPress={() => {
              onNavigate("weeklyPlan");
            }}
          >
            {t("dashboard.openPlan")}
          </Button>
        </SurfaceCard>

        <SurfaceCard>
          <BookOpen aria-hidden="true" />
          <h2>{t("dashboard.cards.quickPractice")}</h2>
          <p>{t("dashboard.quickPracticeBody")}</p>
          <div className={styles.buttonRow}>
            <Button
              className={styles.secondary}
              onPress={() => {
                onNavigate("practice");
              }}
            >
              {t("dashboard.openPractice")}
            </Button>
            <Button
              className={styles.secondary}
              onPress={() => {
                onNavigate("writing");
              }}
            >
              {t("dashboard.openWriting")}
            </Button>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <History aria-hidden="true" />
          <h2>{t("dashboard.cards.corrections")}</h2>
          {snapshot && snapshot.recentCorrections.length > 0 ? (
            <ul className={styles.compactList}>
              {snapshot.recentCorrections.map((correction) => (
                <li key={correction.correctionId}>
                  {t("dashboard.correctionItem", {
                    count: correction.changedSegmentCount,
                    date: correction.createdAt.slice(0, 10),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyCard>{t("dashboard.emptyCorrections")}</EmptyCard>
          )}
          <Button
            className={styles.secondary}
            onPress={() => {
              onNavigate("history");
            }}
          >
            {t("dashboard.openHistory")}
          </Button>
        </SurfaceCard>

        <SurfaceCard>
          <Repeat2 aria-hidden="true" />
          <h2>{t("dashboard.cards.mistakes")}</h2>
          {snapshot && snapshot.recurringMistakes.length > 0 ? (
            <ul className={styles.compactList}>
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
            </ul>
          ) : (
            <EmptyCard>{t("dashboard.emptyMistakes")}</EmptyCard>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <LibraryBig aria-hidden="true" />
          <h2>{t("dashboard.cards.vocabulary")}</h2>
          {snapshot && snapshot.dueVocabulary.length > 0 ? (
            <ul className={styles.compactList}>
              {snapshot.dueVocabulary.map((entry) => (
                <li key={entry.vocabularyId}>
                  <strong>{entry.lemma}</strong> — {entry.meaning}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyCard>{t("dashboard.emptyVocabulary")}</EmptyCard>
          )}
          <Button
            className={styles.secondary}
            onPress={() => {
              onNavigate("vocabulary");
            }}
          >
            {t("dashboard.openVocabulary")}
          </Button>
        </SurfaceCard>

      </div>
      {snapshot && (
        <p className={styles.refreshStamp} role="status">
          {t("dashboard.refreshed", { time: snapshot.refreshedAt.slice(11, 16) })}
        </p>
      )}
    </section>
  );
}
