import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calendarDateSchema,
  type DesktopIpcResponse,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import { LibraryBig, PauseCircle, PlayCircle, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import { normalizeDesktopError, invokeDesktop } from "./ipc.js";
import { SurfaceCard } from "./components/Foundation.js";

type VocabularyResult = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "vocabulary/read" }
>["result"];
type VocabularyEntry = VocabularyResult["entries"][number];

type VocabularyPageProps = Readonly<{ onNavigate: (page: "history" | "practice") => void }>;

function morphology(entry: VocabularyEntry): string | undefined {
  if (entry.lexeme.partOfSpeech !== "noun") return undefined;
  const plural = entry.lexeme.plural.status === "form" ? ` · ${entry.lexeme.plural.form}` : "";
  return `${entry.lexeme.nounForm.article}${plural}`;
}

export function VocabularyPage({ onNavigate }: VocabularyPageProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<VocabularyResult>();
  const [filter, setFilter] = useState<"all" | "candidate" | "due" | "active" | "suspended">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const [request, setRequest] = useState("");
  const [topic, setTopic] = useState("");
  const [setTitle, setSetTitle] = useState("");
  const [editing, setEditing] = useState<string>();
  const [editLemma, setEditLemma] = useState("");
  const [editMeaning, setEditMeaning] = useState("");
  const [editExample, setEditExample] = useState("");
  const [editExampleMeaning, setEditExampleMeaning] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await invokeDesktop("vocabulary/read", {}));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh();
    }, 0);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const visibleEntries = useMemo(
    () =>
      (result?.entries ?? []).filter((entry) => {
        if (filter === "all") return true;
        if (filter === "due") return entry.state.status === "active" && entry.state.dueOn <= today;
        return entry.state.status === filter;
      }),
    [filter, result, today],
  );

  const startEdit = (entry: VocabularyEntry) => {
    setEditing(entry.vocabularyId);
    setEditLemma(entry.lemma);
    setEditMeaning(entry.meaning);
    setEditExample(entry.examples[0]?.german ?? entry.lemma);
    setEditExampleMeaning(entry.examples[0]?.meaning ?? entry.meaning);
  };

  return (
    <section className={styles.page}>
      <div className={styles.dashboardHeading}>
        <div>
          <p className={styles.eyebrow}>{t("vocabulary.eyebrow")}</p>
          <h1 className={styles.hero}>{t("vocabulary.title")}</h1>
          <p className={styles.lead}>{t("vocabulary.body")}</p>
        </div>
        <Button className={styles.secondary} isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" /> {t("vocabulary.refresh")}
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
            <h2>{t("vocabulary.createTitle")}</h2>
            <p>{t("vocabulary.createBody")}</p>
          </div>
          <Sparkles aria-hidden="true" />
        </div>
        <label className={styles.controlLabel}>
          {t("vocabulary.request")}
          <input
            value={request}
            onChange={(event) => {
              setRequest(event.target.value);
            }}
          />
        </label>
        <div className={styles.settingsGrid}>
          <label className={styles.controlLabel}>
            {t("vocabulary.topic")}
            <input
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
              }}
            />
          </label>
          <label className={styles.controlLabel}>
            {t("vocabulary.setTitle")}
            <input
              value={setTitle}
              onChange={(event) => {
                setSetTitle(event.target.value);
              }}
            />
          </label>
        </div>
        <Button
          className={styles.primary}
          isDisabled={
            busy ||
            request.trim().length === 0 ||
            (result?.entries ?? []).every((entry) => entry.state.status !== "candidate")
          }
          onPress={() =>
            void mutate(async () => {
              await invokeDesktop("vocabulary-set/create", {
                naturalRequest: request,
                topic: topic || undefined,
                title: setTitle || request.slice(0, 160),
              });
              setRequest("");
            })
          }
        >
          {t("vocabulary.createSet")}
        </Button>
      </SurfaceCard>

      <div className={styles.historyFilters} aria-label={t("vocabulary.filtersLabel")}>
        {(["all", "candidate", "due", "active", "suspended"] as const).map((value) => (
          <Button
            className={filter === value ? styles.primary : styles.secondary}
            key={value}
            onPress={() => {
              setFilter(value);
            }}
          >
            {t(`vocabulary.filters.${value}`)}
          </Button>
        ))}
      </div>

      <div className={styles.dashboardGrid} aria-busy={busy}>
        {visibleEntries.length === 0 ? (
          <SurfaceCard>
            <LibraryBig aria-hidden="true" />
            <p>{t("vocabulary.empty")}</p>
          </SurfaceCard>
        ) : (
          visibleEntries.map((entry) => {
            const activeState = entry.state.status === "active" ? entry.state : undefined;
            const suspendedState = entry.state.status === "suspended" ? entry.state : undefined;
            const suspended = suspendedState !== undefined;
            const candidate = entry.state.status === "candidate";
            const due = activeState !== undefined && activeState.dueOn <= today;
            const stateText =
              entry.state.status === "candidate"
                ? t("vocabulary.candidateState")
                : activeState
                  ? t("vocabulary.due", {
                      date: activeState.dueOn,
                      stage: activeState.stage,
                    })
                  : t("vocabulary.suspendedState", { reason: suspendedState?.reason });
            return (
              <SurfaceCard key={entry.vocabularyId}>
                <div className={styles.historyEntryHeader}>
                  <div>
                    <h2>{entry.lemma}</h2>
                    <p className={styles.muted}>{entry.meaning}</p>
                  </div>
                  {morphology(entry) && <strong>{morphology(entry)}</strong>}
                </div>
                <p>{entry.examples[0]?.german}</p>
                <p className={styles.muted}>{entry.examples[0]?.meaning}</p>
                <p className={styles.muted}>{stateText}</p>
                <div className={styles.buttonRow}>
                  {candidate && (
                    <Button
                      className={styles.primary}
                      onPress={() =>
                        void mutate(() =>
                          invokeDesktop("vocabulary/confirm", {
                            vocabularyId: entry.vocabularyId,
                            dueOn: calendarDateSchema.parse(new Date().toISOString().slice(0, 10)),
                          }),
                        )
                      }
                    >
                      {t("vocabulary.confirm")}
                    </Button>
                  )}
                  {due && (
                    <>
                      {(["again", "hard", "good", "easy"] as const).map((grade) => (
                        <Button
                          className={styles.secondary}
                          key={grade}
                          onPress={() =>
                            void mutate(() =>
                              invokeDesktop("vocabulary/review", {
                                vocabularyId: entry.vocabularyId,
                                grade,
                              }),
                            )
                          }
                        >
                          {t(`vocabulary.grades.${grade}`)}
                        </Button>
                      ))}
                      <Button
                        className={styles.secondary}
                        onPress={() =>
                          void mutate(() =>
                            invokeDesktop("vocabulary/suspend", {
                              vocabularyId: entry.vocabularyId,
                              expectedRevision: entry.revision,
                              reason: "learner-paused",
                            }),
                          )
                        }
                      >
                        <PauseCircle aria-hidden="true" /> {t("vocabulary.suspend")}
                      </Button>
                    </>
                  )}
                  {suspended && (
                    <Button
                      className={styles.secondary}
                      onPress={() =>
                        void mutate(() =>
                          invokeDesktop("vocabulary/resume", {
                            vocabularyId: entry.vocabularyId,
                            expectedRevision: entry.revision,
                          }),
                        )
                      }
                    >
                      <PlayCircle aria-hidden="true" /> {t("vocabulary.resume")}
                    </Button>
                  )}
                  <Button
                    className={styles.secondary}
                    onPress={() => {
                      startEdit(entry);
                    }}
                  >
                    {t("vocabulary.edit")}
                  </Button>
                  <Button
                    className={styles.secondary}
                    onPress={() => {
                      onNavigate(entry.source.kind === "activity" ? "practice" : "history");
                    }}
                  >
                    {t("vocabulary.openSource")}
                  </Button>
                  <Button
                    className={styles.danger}
                    onPress={() => {
                      if (window.confirm(t("vocabulary.deleteConfirm"))) {
                        void mutate(() =>
                          invokeDesktop("vocabulary/delete", { vocabularyId: entry.vocabularyId }),
                        );
                      }
                    }}
                  >
                    {t("vocabulary.delete")}
                  </Button>
                </div>
                {editing === entry.vocabularyId && (
                  <div className={styles.settingsSection}>
                    <label className={styles.controlLabel}>
                      {t("vocabulary.lemma")}
                      <input
                        value={editLemma}
                        onChange={(event) => {
                          setEditLemma(event.target.value);
                        }}
                      />
                    </label>
                    <label className={styles.controlLabel}>
                      {t("vocabulary.meaning")}
                      <input
                        value={editMeaning}
                        onChange={(event) => {
                          setEditMeaning(event.target.value);
                        }}
                      />
                    </label>
                    <label className={styles.controlLabel}>
                      {t("vocabulary.example")}
                      <input
                        value={editExample}
                        onChange={(event) => {
                          setEditExample(event.target.value);
                        }}
                      />
                    </label>
                    <label className={styles.controlLabel}>
                      {t("vocabulary.exampleMeaning")}
                      <input
                        value={editExampleMeaning}
                        onChange={(event) => {
                          setEditExampleMeaning(event.target.value);
                        }}
                      />
                    </label>
                    <div className={styles.buttonRow}>
                      <Button
                        className={styles.primary}
                        onPress={() =>
                          void mutate(async () => {
                            await invokeDesktop("vocabulary/edit", {
                              vocabularyId: entry.vocabularyId,
                              expectedRevision: entry.revision,
                              lemma: editLemma,
                              meaning: editMeaning,
                              example: editExample,
                              exampleMeaning: editExampleMeaning,
                            });
                            setEditing(undefined);
                          })
                        }
                      >
                        {t("vocabulary.save")}
                      </Button>
                      <Button
                        className={styles.secondary}
                        onPress={() => {
                          setEditing(undefined);
                        }}
                      >
                        {t("actions.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>

      {(result?.lessonSets.length ?? 0) > 0 && (
        <SurfaceCard>
          <h2>{t("vocabulary.lessonSets")}</h2>
          <ul className={styles.compactList}>
            {result?.lessonSets.map((set) => (
              <li key={set.setId}>
                <strong>{set.title}</strong> —{" "}
                {t("vocabulary.lessonSetItems", { count: set.vocabularyIds.length })}
              </li>
            ))}
          </ul>
        </SurfaceCard>
      )}
    </section>
  );
}
