import { useCallback, useEffect, useRef, useState } from "react";
import type { DataRootGeneration, OpenDeutschError } from "@open-deutsch/contracts";
import { useTranslation } from "react-i18next";
import { ActionGroup, Page } from "./components/layout/index.js";
import { Button, Card, Feedback, LoadingState } from "./components/ui/index.js";
import { invokeDesktop, normalizeDesktopError } from "./ipc.js";
import { VocabularyInformation } from "./VocabularyDetails.js";
import { vocabularyVersion, type VocabularyEntry } from "./useVocabularyLibrary.js";
import styles from "./VocabularyPage.module.css";

export function VocabularyReview({
  rootGeneration,
  onExit,
  onChanged,
}: {
  rootGeneration: DataRootGeneration;
  onExit: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<VocabularyEntry[]>();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dueOn, setDueOn] = useState<string>();
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<OpenDeutschError>();
  const locked = useRef(false);
  const version = useRef(0);
  const wordHeading = useRef<HTMLHeadingElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (dueOn || error) nextButton.current?.focus();
    else if (revealed) answer.current?.focus();
  }, [dueOn, error, revealed]);
  const load = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    const current = ++version.current;
    setBusy(true);
    setError(undefined);
    try {
      const result = await invokeDesktop("vocabulary/review-queue", { rootGeneration });
      if (current !== version.current) return;
      setQueue(result.entries);
      setIndex(0);
      setReviewed(0);
      setDueOn(undefined);
      setRevealed(false);
    } catch (cause) {
      if (current === version.current) setError(normalizeDesktopError(cause).detail);
    } finally {
      if (current === version.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }, [rootGeneration]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      version.current += 1;
      locked.current = false;
      window.clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    wordHeading.current?.focus();
  }, [index, queue]);
  const entry = queue?.[index];
  const grade = async (value: "again" | "hard" | "good" | "easy") => {
    if (!entry || !revealed || dueOn || locked.current || error) return;
    locked.current = true;
    const current = version.current;
    setBusy(true);
    try {
      const result = await invokeDesktop("vocabulary/review", {
        rootGeneration,
        ...vocabularyVersion(entry),
        grade: value,
      });
      if (current !== version.current) return;
      setDueOn(result.dueOn);
      setReviewed((previous) => previous + 1);
      onChanged();
    } catch (cause) {
      if (current === version.current) setError(normalizeDesktopError(cause).detail);
    } finally {
      if (current === version.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const next = () => {
    setIndex(index + 1);
    setRevealed(false);
    setDueOn(undefined);
    setError(undefined);
  };
  return (
    <Page
      title={t("vocabulary.review.title")}
      actions={
        <Button variant="secondary" onPress={onExit}>
          {t("vocabulary.review.back")}
        </Button>
      }
    >
      {error && (
        <Feedback tone="error" live="assertive">
          {t(error.messageKey)} {entry && t("vocabulary.review.failed")}
        </Feedback>
      )}
      {!queue && busy && <LoadingState live>{t("ui.loading")}</LoadingState>}
      {!queue && !busy && <Button onPress={() => void load()}>{t("vocabulary.refresh")}</Button>}
      {entry && (
        <Card as="article" className={styles.reviewCard}>
          <p>{t("vocabulary.review.progress", { current: index + 1, total: queue?.length })}</p>
          <h2 ref={wordHeading} tabIndex={-1} lang="de">
            {entry.lemma}
          </h2>
          {!revealed && (
            <Button onPress={() => setRevealed(true)}>{t("vocabulary.review.reveal")}</Button>
          )}
          {revealed && (
            <div
              ref={answer}
              tabIndex={-1}
              role="region"
              aria-label={t("vocabulary.review.answer")}
            >
              <VocabularyInformation entry={entry} />
              {!dueOn && (
                <ActionGroup>
                  {(["again", "hard", "good", "easy"] as const).map((value) => (
                    <Button
                      key={value}
                      variant="secondary"
                      isDisabled={busy || Boolean(error)}
                      onPress={() => void grade(value)}
                    >
                      {t(`vocabulary.grades.${value}`)}
                    </Button>
                  ))}
                </ActionGroup>
              )}
            </div>
          )}
          {dueOn && (
            <Feedback tone="success" live="polite">
              {t("vocabulary.review.saved", { date: dueOn })}
            </Feedback>
          )}
          {(dueOn || error) && (
            <Button ref={nextButton} isDisabled={busy} onPress={next}>
              {t(error ? "vocabulary.review.skip" : "vocabulary.review.next")}
            </Button>
          )}
        </Card>
      )}
      {queue && !entry && (
        <Card as="article">
          <h2 ref={wordHeading} tabIndex={-1}>
            {t("vocabulary.review.complete")}
          </h2>
          <p>{t("vocabulary.review.reviewed", { count: reviewed })}</p>
          {queue.length === 0 && <p>{t("vocabulary.review.noneDue")}</p>}
          <ActionGroup>
            <Button isPending={busy} onPress={() => void load()}>
              {t("vocabulary.review.another")}
            </Button>
            <Button variant="secondary" onPress={onExit}>
              {t("vocabulary.review.back")}
            </Button>
          </ActionGroup>
        </Card>
      )}
    </Page>
  );
}
