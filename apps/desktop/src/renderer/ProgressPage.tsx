import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import { Ear, FilePenLine, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import { StatusMessage, SurfaceCard } from "./components/Foundation.js";
import { invokeDesktop, normalizeDesktopError } from "./ipc.js";

type Snapshot = Extract<DesktopIpcResponse, { status: "ok"; channel: "history/read" }>["result"];
type Entry = Snapshot["entries"][number];
type Pattern = Snapshot["mistakePatterns"][number];

const skillDefinitions = [
  { skill: "writing" as const, icon: FilePenLine },
  { skill: "speaking" as const, icon: MessageCircle },
  { skill: "reading" as const, icon: Sparkles },
  { skill: "listening" as const, icon: Ear },
] as const;

function entryEvidence(entry: Entry) {
  switch (entry.detail.kind) {
    case "writing-correction":
      return entry.detail.feedback.summary;
    case "reading":
      return entry.detail.exerciseResults
        .map(({ kind, outcome }) => `${kind}: ${outcome}`)
        .join(" · ");
    case "listening":
      return entry.detail.exerciseResults
        .map(({ kind, outcome }) => `${kind}: ${outcome}`)
        .join(" · ");
    case "voice-summary":
      return entry.detail.feedback.summary;
    case "placement":
      return entry.detail.sampleResults
        .map(({ kind, outcome }) => `${kind}: ${outcome}`)
        .join(" · ");
    case "exercise-attempt":
      return entry.detail.feedback.summary;
    default:
      return entry.title;
  }
}

export function ProgressPage({ onOpenHistory }: { onOpenHistory: () => void }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const [editingMistakeId, setEditingMistakeId] = useState<string>();
  const [categoryKey, setCategoryKey] = useState("");
  const [lemma, setLemma] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setSnapshot(await invokeDesktop("history/read", { maximum: 100 }));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
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

  const entriesBySkill = useMemo(() => {
    const entries = snapshot?.entries ?? [];
    return Object.fromEntries(
      skillDefinitions.map(({ skill }) => [
        skill,
        entries.filter((entry) => entry.skill === skill),
      ]),
    ) as Record<(typeof skillDefinitions)[number]["skill"], Entry[]>;
  }, [snapshot?.entries]);

  const beginEdit = (pattern: Pattern) => {
    setEditingMistakeId(pattern.occurrences[0]?.mistakeId);
    setCategoryKey(pattern.category.categoryKey);
    setLemma(pattern.category.kind === "vocabulary" ? pattern.category.lemma : "");
    setNote("");
  };

  const amend = async (pattern: Pattern) => {
    const mistakeId = pattern.occurrences[0]?.mistakeId;
    if (!snapshot || !mistakeId || !categoryKey.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("history/mistake-amend", {
        expectedGeneration: snapshot.rootGeneration,
        mistakeId,
        effectiveCategory:
          pattern.category.kind === "grammar"
            ? {
                kind: "grammar",
                categoryKey: categoryKey.trim(),
                curriculumTopicIds: pattern.category.curriculumTopicIds,
              }
            : { kind: "vocabulary", categoryKey: categoryKey.trim(), lemma: lemma.trim() },
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setEditingMistakeId(undefined);
      await refresh();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.page} data-testid="progress-view" aria-busy={busy}>
      <div className={styles.dashboardHeading}>
        <div>
          <p className={styles.eyebrow}>{t("progress.eyebrow")}</p>
          <h1>{t("progress.title")}</h1>
          <p className={styles.lead}>{t("progress.intro")}</p>
        </div>
        <Button className={styles.secondary} isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" />
          {busy ? t("progress.refreshing") : t("progress.refresh")}
        </Button>
      </div>
      {error ? (
        <StatusMessage tone="error">
          <span>{t(error.messageKey)}</span>
          <code className={styles.diagnostic}>
            {error.reference.code} · {error.reference.correlationId}
          </code>
        </StatusMessage>
      ) : null}
      <StatusMessage>{t("progress.noScore")}</StatusMessage>

      <div className={styles.dashboardGrid}>
        {skillDefinitions.map(({ skill, icon: Icon }) => {
          const entries = entriesBySkill[skill];
          return (
            <SurfaceCard key={skill}>
              <Icon aria-hidden="true" />
              <h2>{t(`history.skills.${skill}`)}</h2>
              <p>{t("progress.activityCount", { count: entries.length })}</p>
              {entries.length > 0 ? (
                <ul className={styles.compactList}>
                  {entries.slice(0, 3).map((entry) => (
                    <li key={entry.historyEntryId}>
                      <strong>{entry.title}</strong>
                      <span className={styles.muted}>{entryEvidence(entry)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>{t("progress.noEvidence")}</p>
              )}
              <Button className={styles.secondary} onPress={onOpenHistory}>
                {t("progress.openHistory")}
              </Button>
            </SurfaceCard>
          );
        })}
      </div>

      <section aria-labelledby="progress-patterns-heading">
        <div className={styles.dashboardHeading}>
          <div>
            <p className={styles.eyebrow}>{t("progress.patternEyebrow")}</p>
            <h2 id="progress-patterns-heading">{t("progress.patternTitle")}</h2>
          </div>
          <Button className={styles.secondary} onPress={onOpenHistory}>
            {t("progress.openHistory")}
          </Button>
        </div>
        {snapshot?.mistakePatterns.length ? (
          <div className={styles.historyMistakeGrid}>
            {snapshot.mistakePatterns.map((pattern) => {
              const mistakeId = pattern.occurrences[0]?.mistakeId;
              const editing = mistakeId === editingMistakeId;
              const label =
                pattern.category.kind === "grammar"
                  ? pattern.category.categoryKey
                  : `${pattern.category.lemma} · ${pattern.category.categoryKey}`;
              return (
                <SurfaceCard key={mistakeId ?? label}>
                  <p className={styles.eyebrow}>
                    {t(`history.patterns.category.${pattern.category.kind}`)}
                  </p>
                  <h3>{label}</h3>
                  <p>{t("progress.patternEvidence", { count: pattern.occurrenceCount })}</p>
                  <p className={styles.muted}>
                    {pattern.classificationSource === "inferred"
                      ? t("progress.inferred")
                      : t("progress.amended")}
                  </p>
                  <Button
                    className={styles.secondary}
                    onPress={() => {
                      if (editing) setEditingMistakeId(undefined);
                      else beginEdit(pattern);
                    }}
                  >
                    {editing ? t("progress.cancelEdit") : t("progress.editInference")}
                  </Button>
                  {editing ? (
                    <div className={styles.historyDetail}>
                      <label className={styles.controlLabel}>
                        {t("progress.categoryKey")}
                        <input
                          value={categoryKey}
                          onChange={(event) => {
                            setCategoryKey(event.target.value);
                          }}
                        />
                      </label>
                      {pattern.category.kind === "vocabulary" ? (
                        <label className={styles.controlLabel}>
                          {t("progress.lemma")}
                          <input
                            value={lemma}
                            onChange={(event) => {
                              setLemma(event.target.value);
                            }}
                          />
                        </label>
                      ) : null}
                      <label className={styles.controlLabel}>
                        {t("progress.note")}
                        <textarea
                          value={note}
                          onChange={(event) => {
                            setNote(event.target.value);
                          }}
                        />
                      </label>
                      <Button
                        className={styles.primary}
                        isDisabled={busy}
                        onPress={() => void amend(pattern)}
                      >
                        {t("progress.saveInference")}
                      </Button>
                    </div>
                  ) : null}
                </SurfaceCard>
              );
            })}
          </div>
        ) : (
          <StatusMessage>{t("progress.noPatterns")}</StatusMessage>
        )}
      </section>
    </section>
  );
}
