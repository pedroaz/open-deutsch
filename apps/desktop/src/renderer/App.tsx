import type { PracticeLaunch } from "./usePracticeSuggestion.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DesktopIpcResponse, type OpenDeutschError } from "@open-deutsch/contracts";
import type { ModelWorkload } from "@open-deutsch/domain";
import {
  Database,
  FilePenLine,
  Gauge,
  History,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Feedback, ModalDialog } from "./components/ui/index.js";
import { ActionGroup, AppShell as ApplicationShell } from "./components/layout/index.js";

import openDeutschLogo from "../../assets/open-deutsch.svg";
import styles from "./AppStyles.module.css";
import { Dashboard } from "./Dashboard.js";
import { ContextualHelper, type ContextualHelperSelection } from "./ContextualHelper.js";
import { HistoryPage, type HistoryPracticeSeed } from "./HistoryPage.js";
import { invokeDesktop, normalizeDesktopError, subscribeDesktop } from "./ipc.js";
import { ProfileOnboarding } from "./ProfileOnboarding.js";
import { LearningPathPage } from "./LearningPathPage.js";
import { PracticePage } from "./PracticePage.js";
import { PersonalDataPage } from "./PersonalDataPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { SidebarModelControl } from "./SidebarModelControl.js";
import { VocabularyPage } from "./VocabularyPage.js";
import { WritingWorkspace } from "./WritingWorkspace.js";
import {
  CodexBanner,
  FolderOnboarding,
  LanguageButton,
  OperationError,
  StartupError,
  StartupFrame,
  ViewBoundary,
} from "./Startup.js";

type Readiness = Extract<DesktopIpcResponse, { status: "ok"; channel: "app/readiness" }>["result"];
type PreparedActivityId = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "dashboard/read" }
>["result"]["preparedActivities"][number]["activityId"];
type Page =
  | "dashboard"
  | "practice"
  | "writing"
  | "vocabulary"
  | "history"
  | "learningPath"
  | "personalData"
  | "settings";

const navigation: ReadonlyArray<{
  page: Page;
  icon: typeof LayoutDashboard;
}> = [
  { page: "dashboard", icon: LayoutDashboard },
  { page: "practice", icon: Gauge },
  { page: "writing", icon: FilePenLine },
  { page: "vocabulary", icon: LibraryBig },
  { page: "history", icon: History },
  { page: "learningPath", icon: Sparkles },
  { page: "personalData", icon: Database },
  { page: "settings", icon: Settings },
];

function FirstAiReminder({ close }: { close: (acknowledged: boolean) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const acknowledge = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("privacy/ai-disclosure/acknowledge", {});
      close(true);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalDialog
      isOpen
      title={t("aiReminder.title")}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <p>{t("aiReminder.body")}</p>
      {error && <OperationError error={error} />}
      <ActionGroup>
        <Button
          isPending={busy}
          pendingLabel={t("actions.acknowledge")}
          variant="primary"
          onPress={() => void acknowledge()}
        >
          {t("actions.acknowledge")}
        </Button>
        <Button variant="secondary" isDisabled={busy} onPress={() => close(false)}>
          {t("actions.cancel")}
        </Button>
      </ActionGroup>
    </ModalDialog>
  );
}

function DesktopWorkspace({
  readiness,
  reload,
}: {
  readiness: Readiness;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [historyEntryIds, setHistoryEntryIds] = useState<NonNullable<Extract<import("@open-deutsch/contracts").DesktopIpcRequest, { channel: "history/read" }>["payload"]["historyEntryIds"]>>();
  const [page, setPage] = useState<Page>("dashboard");
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const [wideHelper, setWideHelper] = useState(
    () => window.matchMedia("(min-width: 68.01rem)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 68.01rem)");
    const update = () => setWideHelper(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [helperPreference, setHelperPreference] = useState<boolean>();
  const helperOpen = helperPreference ?? (page === "writing" && wideHelper);
  const [reminderOpen, setReminderOpen] = useState(false);
  const disclosure = useRef<Array<(value: boolean) => void>>([]);
  useEffect(
    () => () => {
      for (const resolve of disclosure.current.splice(0)) resolve(false);
    },
    [],
  );
  const [accountSignedOut, setAccountSignedOut] = useState(false);
  const [resetNotice, setResetNotice] = useState(false);
  useEffect(() => {
    void invokeDesktop("development-notice/read", {}).then(result => setResetNotice(result.pending)).catch(cause => setOperationError(normalizeDesktopError(cause).detail));
  }, []);
  const [operationError, setOperationError] = useState<OpenDeutschError>();
  const [writingDirty, setWritingDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<Page>();
  const [writingSeed, setWritingSeed] =
    useState<Extract<HistoryPracticeSeed, { kind: "writing" }>>();
  const [preparedActivityId, setPreparedActivityId] = useState<PreparedActivityId>();
  const [suggestedWriting, setSuggestedWriting] = useState<string>();
  const [practiceSeed, setPracticeSeed] =
    useState<Extract<PracticeLaunch, { destination: "preparation" }>>();
  const [vocabularyDue, setVocabularyDue] = useState(false);
  const launchPractice = (intent: PracticeLaunch) => {
    if (intent.destination === "writing") {
      setWritingSeed(undefined);
      setSuggestedWriting(intent.prompt);
      setPage("writing");
    } else if (intent.destination === "vocabulary") {
      setVocabularyDue(true);
      setPage("vocabulary");
    } else {
      setPreparedActivityId(intent.destination === "activity" ? intent.activityId : undefined);
      setPracticeSeed(intent.destination === "preparation" ? intent : undefined);
      setPage("practice");
    }
  };
  const [helperSelection, setHelperSelection] = useState<ContextualHelperSelection>();
  const [helperEpoch, setHelperEpoch] = useState(0);

  useEffect(() => {
    let disposed = false;
    const refreshAccount = () => {
      void invokeDesktop("codex/account/read", {})
        .then((state) => {
          if (!disposed) setAccountSignedOut(state.status === "signed-out");
        })
        .catch((cause: unknown) => {
          if (!disposed) setOperationError(normalizeDesktopError(cause).detail);
        });
    };
    refreshAccount();
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "state-invalidated" && event.scope === "account") refreshAccount();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "prepared-activity-open") {
        setPracticeSeed(undefined);
        setPreparedActivityId(event.activityId);
        if (writingDirty) setPendingPage("practice");
        else setPage("practice");
        return;
      }
      if (event.event === "data-root-changed") {
        void reload();
        return;
      }
      if (
        event.event === "state-invalidated" &&
        (event.scope === "account" || event.scope === "settings")
      )
        void reload();
    });
    return unsubscribe;
  }, [reload, writingDirty]);

  const openAi = async () => {
    setOperationError(undefined);
    try {
      const privacy = await invokeDesktop("privacy/ai-disclosure/read", {});
      if (!privacy.acknowledged) {
        if (disclosure.current.length > 0) return false;
        setReminderOpen(true);
        return new Promise<boolean>((resolve) => disclosure.current.push(resolve));
      }
      return true;
    } catch (cause) {
      setOperationError(normalizeDesktopError(cause).detail);
      return false;
    }
  };

  const moveNavFocus = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.closest("nav")?.querySelectorAll<HTMLButtonElement>("[data-nav]") ?? [],
    );
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    buttons[(current + delta + buttons.length) % buttons.length]?.focus();
  };

  const navigate = (destination: Page) => {
    if (destination === "history") setHistoryEntryIds(undefined);
    if (page === "writing" && writingDirty && destination !== "writing") {
      setPendingPage(destination);
      return;
    }
    if (destination === "writing" && page !== "writing") {
      setWritingSeed(undefined);
      setSuggestedWriting(undefined);
    }
    if (destination === "practice") {
      setPreparedActivityId(undefined);
      setPracticeSeed(undefined);
    }
    if (destination === "vocabulary") setVocabularyDue(false);
    setPage(destination);
  };
  const modelWorkload: ModelWorkload = page === "writing" ? "correction" : "generation";

  return (
    <>
      <ApplicationShell
        activePage={page}
        brandMark={openDeutschLogo}
        brandName={t("app.name")}
        content={
          <>
            <CodexBanner readiness={readiness} />
            {resetNotice && <Feedback live="polite">
              <p>{t("developmentReset.body")}</p>
              <Button onPress={() => { void invokeDesktop("development-notice/dismiss", {}).then(() => setResetNotice(false)).catch(cause => setOperationError(normalizeDesktopError(cause).detail)); }}>{t("developmentReset.dismiss")}</Button>
            </Feedback>}
            {operationError && <OperationError error={operationError} />}
            {accountSignedOut && readiness.codex.status === "available" && (
              <Feedback live="polite">
                <UserRound aria-hidden="true" /> {t("codex.signedOut")}
              </Feedback>
            )}
            {page === "dashboard" ? (
              <Dashboard requestAiAccess={openAi} onLaunch={launchPractice} onNavigate={navigate} />
            ) : null}
            {page === "practice" ? (
              <PracticePage
                {...(practiceSeed ? { initialPreparation: practiceSeed } : {})}
                {...(preparedActivityId ? { activityId: preparedActivityId } : {})}
                requestAiAccess={openAi}
                onOpenActivity={(activityId) => {
                  setPreparedActivityId(activityId);
                }}
                onCloseActivity={() => {
                  setPreparedActivityId(undefined);
                }}
              />
            ) : null}
            {page === "writing" ? (
              <WritingWorkspace
                key={writingSeed?.historyEntryId ?? "new-writing"}
                {...(writingSeed
                  ? { initialContext: writingSeed.context, initialDraft: writingSeed.draft }
                  : suggestedWriting
                    ? { initialContext: suggestedWriting }
                    : {})}
                onDirtyChange={setWritingDirty}
                onHelperSelection={setHelperSelection}
                requestAiAccess={openAi}
              />
            ) : null}
            {page === "history" ? (
              <HistoryPage
                {...(historyEntryIds ? { initialHistoryEntryIds: historyEntryIds } : {})}
                requestAiAccess={openAi}
                onPracticeAgain={(seed) => {
                  if (seed.kind === "exercise") {
                    setPracticeSeed(undefined);
                    setPreparedActivityId(seed.activityId as PreparedActivityId);
                    setPage("practice");
                  } else {
                    setWritingSeed(seed);
                    setWritingDirty(false);
                    setPage("writing");
                  }
                }}
              />
            ) : null}
            {page === "learningPath" ? <LearningPathPage requestAiAccess={openAi} onOpenHistory={(ids) => { setHistoryEntryIds(ids); setPage("history"); }} /> : null}
            {page === "vocabulary" ? (
              <VocabularyPage
                initialDueOnly={vocabularyDue}
                onNavigate={(destination) => {
                  navigate(destination);
                }}
              />
            ) : null}
            {page === "personalData" ? (
              <PersonalDataPage
                onDataCleared={() => {
                  setHelperSelection(undefined);
                  setHelperEpoch((value) => value + 1);
                  setWritingSeed(undefined);
                  setSuggestedWriting(undefined);
                  setWritingDirty(false);
                  setPracticeSeed(undefined);
                  setPreparedActivityId(undefined);
                }}
              />
            ) : null}
            {page === "settings" ? (
              <SettingsPage readiness={readiness} onDataRootChanged={reload} />
            ) : null}
          </>
        }
        exerciseMode={page === "practice" && Boolean(preparedActivityId)}
        header={<LanguageButton />}
        helper={
          <ContextualHelper key={helperEpoch} selection={helperSelection} requestAiAccess={openAi} />
        }
        helperOpen={helperOpen}
        helperTitle={t("dashboard.helperTitle")}
        helperToggleLabel={helperOpen ? t("actions.hideHelper") : t("actions.showHelper")}
        navCollapsed={navCollapsed}
        navigation={navigation.map(({ page: destination, icon }) => ({
          page: destination,
          icon,
          label: t(`nav.${destination}`),
        }))}
        navigationLabel={t("nav.label")}
        navFooter={<SidebarModelControl initialWorkload={modelWorkload} />}
        navToggleLabel={
          navCollapsed ? t("actions.expandNavigation") : t("actions.collapseNavigation")
        }
        wide={page === "writing"}
        onMoveNavFocus={moveNavFocus}
        onNavigate={navigate}
        onToggleHelper={() => {
          setHelperPreference(!helperOpen);
        }}
        onToggleNavigation={() => {
          setNavCollapsed((current) => !current);
        }}
      />
      {reminderOpen && (
        <FirstAiReminder
          close={(acknowledged) => {
            setReminderOpen(false);
            for (const resolve of disclosure.current.splice(0)) resolve(acknowledged);
          }}
        />
      )}
      {pendingPage && (
        <ModalDialog
          isOpen
          title={t("writing.unsavedTitle")}
          onOpenChange={(open) => {
            if (!open) setPendingPage(undefined);
          }}
        >
          <p>{t("writing.unsavedBody")}</p>
          <ActionGroup>
            <Button
              variant="danger"
              onPress={() => {
                setWritingDirty(false);
                setPage(pendingPage);
                setPendingPage(undefined);
              }}
            >
              {t("writing.leave")}
            </Button>
            <Button onPress={() => setPendingPage(undefined)}>{t("writing.keepEditing")}</Button>
          </ActionGroup>
        </ModalDialog>
      )}
    </>
  );
}

export default function App() {
  const { t } = useTranslation();
  const [readiness, setReadiness] = useState<Readiness>();
  const [fatal, setFatal] = useState<OpenDeutschError>();
  const [recoveringRoot, setRecoveringRoot] = useState(false);
  const [profileOnboarding, setProfileOnboarding] = useState(false);
  const load = useCallback(async () => {
    setFatal(undefined);
    try {
      const nextReadiness = await invokeDesktop("app/readiness", {});
      setReadiness(nextReadiness);
      if (nextReadiness.dataRoot.status === "ready") {
        const profile = await invokeDesktop("learner-profile/read", {});
        setProfileOnboarding(profile.status === "not-created");
      }
      setRecoveringRoot(false);
    } catch (cause) {
      setFatal(normalizeDesktopError(cause).detail);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    window.openDeutsch.ready();
    return () => {
      window.clearTimeout(initialLoad);
    };
  }, [load]);
  if (fatal) {
    return (
      <StartupFrame>
        <section className={styles.startupCard} role="alert">
          <h1>{t("startup.unavailableTitle")}</h1>
          <p>{t("startup.unavailableBody")}</p>
          <OperationError error={fatal} />
          <Button variant="primary" onPress={() => void load()}>
            {t("actions.retry")}
          </Button>
        </section>
      </StartupFrame>
    );
  }
  if (!readiness) {
    return (
      <StartupFrame>
        <section className={styles.startupCard} role="status">
          <LoaderCircle aria-hidden="true" /> {t("startup.loading")}
        </section>
      </StartupFrame>
    );
  }
  if (readiness.dataRoot.status === "unconfigured" || recoveringRoot)
    return (
      <FolderOnboarding
        onReady={async () => {
          await load();
        }}
      />
    );
  if (readiness.dataRoot.status === "unavailable")
    return (
      <StartupError
        readiness={readiness}
        retry={load}
        recover={() => {
          setRecoveringRoot(true);
        }}
      />
    );
  if (profileOnboarding)
    return (
      <ProfileOnboarding
        readiness={readiness}
        onComplete={() => {
          setProfileOnboarding(false);
        }}
      />
    );
  return (
    <ViewBoundary
      title={t("errors.boundaryTitle")}
      body={t("errors.boundaryBody")}
      close={t("actions.close")}
    >
      <DesktopWorkspace
        key={readiness.dataRoot.status === "ready" ? readiness.dataRoot.generation : "unavailable"}
        readiness={readiness}
        reload={load}
      />
    </ViewBoundary>
  );
}
