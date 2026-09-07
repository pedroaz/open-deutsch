import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calendarDateSchema,
  type DesktopIpcResponse,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import { LibraryBig, PauseCircle, PlayCircle, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Feedback, FieldGroup, Muted, ItemList } from "./components/ui/index.js";
import { SectionHeader, ActionGroup, ContentGrid, FilterBar, FormGrid, Page } from "./components/layout/index.js";

import styles from "./VocabularyPage.module.css";
import { normalizeDesktopError, invokeDesktop } from "./ipc.js";

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
    <Page
      actions={
        <Button isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" /> {t("vocabulary.refresh")}
        </Button>
      }
      description={t("vocabulary.body")}
      eyebrow={t("vocabulary.eyebrow")}
      title={t("vocabulary.title")}
    >
      {error && <Feedback live="assertive" tone="error">{t(error.messageKey)}</Feedback>}

      <Card as="article">
        <SectionHeader>
          <div>
            <h2>{t("vocabulary.createTitle")}</h2>
            <p>{t("vocabulary.createBody")}</p>
          </div>
          <Sparkles aria-hidden="true" />
        </SectionHeader>
        <FieldGroup>
          {t("vocabulary.request")}
          <input
            value={request}
            onChange={(event) => {
              setRequest(event.target.value);
            }}
          />
        </FieldGroup>
        <FormGrid>
          <FieldGroup>
            {t("vocabulary.topic")}
            <input
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
              }}
            />
          </FieldGroup>
          <FieldGroup>
            {t("vocabulary.setTitle")}
            <input
              value={setTitle}
              onChange={(event) => {
                setSetTitle(event.target.value);
              }}
            />
          </FieldGroup>
        </FormGrid>
        <Button
          variant="primary"
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
      </Card>

      <FilterBar columns={4} label={t("vocabulary.filtersLabel")}>
        {(["all", "candidate", "due", "active", "suspended"] as const).map((value) => (
          <Button
            variant={filter === value ? "primary" : "secondary"}
            key={value}
            onPress={() => {
              setFilter(value);
            }}
          >
            {t(`vocabulary.filters.${value}`)}
          </Button>
        ))}
      </FilterBar>

      <ContentGrid fillLast aria-busy={busy}>
        {visibleEntries.length === 0 ? (
          <Card as="article">
            <LibraryBig aria-hidden="true" />
            <p>{t("vocabulary.empty")}</p>
          </Card>
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
              <Card as="article" key={entry.vocabularyId}>
                <SectionHeader>
                  <div>
                    <h2>{entry.lemma}</h2>
                    <Muted as="p">{entry.meaning}</Muted>
                  </div>
                  {morphology(entry) && <strong>{morphology(entry)}</strong>}
                </SectionHeader>
                <p>{entry.examples[0]?.german}</p>
                <Muted as="p">{entry.examples[0]?.meaning}</Muted>
                <Muted as="p">{stateText}</Muted>
                <ActionGroup>
                  {candidate && (
                    <Button
                      variant="primary"
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

                    onPress={() => {
                      startEdit(entry);
                    }}
                  >
                    {t("vocabulary.edit")}
                  </Button>
                  <Button

                    onPress={() => {
                      onNavigate(entry.source.kind === "activity" ? "practice" : "history");
                    }}
                  >
                    {t("vocabulary.openSource")}
                  </Button>
                  <Button
                    variant="danger"
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
                </ActionGroup>
                {editing === entry.vocabularyId && (
                  <Card>
                    <FieldGroup>
                      {t("vocabulary.lemma")}
                      <input
                        value={editLemma}
                        onChange={(event) => {
                          setEditLemma(event.target.value);
                        }}
                      />
                    </FieldGroup>
                    <FieldGroup>
                      {t("vocabulary.meaning")}
                      <input
                        value={editMeaning}
                        onChange={(event) => {
                          setEditMeaning(event.target.value);
                        }}
                      />
                    </FieldGroup>
                    <FieldGroup>
                      {t("vocabulary.example")}
                      <input
                        value={editExample}
                        onChange={(event) => {
                          setEditExample(event.target.value);
                        }}
                      />
                    </FieldGroup>
                    <FieldGroup>
                      {t("vocabulary.exampleMeaning")}
                      <input
                        value={editExampleMeaning}
                        onChange={(event) => {
                          setEditExampleMeaning(event.target.value);
                        }}
                      />
                    </FieldGroup>
                    <ActionGroup>
                      <Button
                        variant="primary"
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

                        onPress={() => {
                          setEditing(undefined);
                        }}
                      >
                        {t("actions.cancel")}
                      </Button>
                    </ActionGroup>
                  </Card>
                )}
              </Card>
            );
          })
        )}
      </ContentGrid>

      {(result?.lessonSets.length ?? 0) > 0 && (
        <Card as="article">
          <h2>{t("vocabulary.lessonSets")}</h2>
          <ItemList>
            {result?.lessonSets.map((set) => (
              <li key={set.setId}>
                <strong>{set.title}</strong> —{" "}
                {t("vocabulary.lessonSetItems", { count: set.vocabularyIds.length })}
              </li>
            ))}
          </ItemList>
        </Card>
      )}
    </Page>
  );
}
