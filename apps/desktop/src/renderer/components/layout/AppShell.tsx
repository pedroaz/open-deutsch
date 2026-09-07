import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";

import { IconButton, Tooltip } from "../ui/Button.js";
import styles from "./AppShell.module.css";

export type ShellNavigationItem<Page extends string> = Readonly<{ page: Page; label: string; icon: LucideIcon }>;

export function AppShell<Page extends string>(props: {
  activePage: Page;
  navigation: ReadonlyArray<ShellNavigationItem<Page>>;
  navigationLabel: string;
  brandName: string;
  brandMark: string;
  navCollapsed: boolean;
  navToggleLabel: string;
  helperOpen: boolean;
  helperTitle: string;
  helperToggleLabel: string;
  exerciseMode?: boolean;
  wide?: boolean;
  header: ReactNode;
  content: ReactNode;
  helper: ReactNode;
  navFooter?: ReactNode;
  onNavigate: (page: Page) => void;
  onMoveNavFocus: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onToggleNavigation: () => void;
  onToggleHelper: () => void;
}) {
  return <div className={`${styles.shell} ${props.exerciseMode ? styles.exerciseMode : ""} ${props.navCollapsed ? styles.navCollapsed : ""} ${props.helperOpen ? "" : styles.helperCollapsed} ${props.wide ? styles.wide : ""}`} data-exercise-mode={props.exerciseMode || undefined} data-nav-collapsed={props.navCollapsed || undefined}>
    <nav className={styles.nav} aria-label={props.navigationLabel}><div className={styles.navInner}>
      <div className={styles.brand}><img alt="" className={styles.brandMark} src={props.brandMark} /><span className={styles.brandText}>{props.brandName}</span><IconButton label={props.navToggleLabel} leadingIcon={props.navCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />} onPress={props.onToggleNavigation} /></div>
      <ul className={styles.navList}>
        {props.navigation.map(({ page, label, icon: Icon }) => {
          const control = (
            <button
              aria-current={props.activePage === page ? "page" : undefined}
              className={styles.navButton}
              data-nav
              onClick={() => props.onNavigate(page)}
              onKeyDown={props.onMoveNavFocus}
              type="button"
            >
              <Icon aria-hidden="true" />
              <span className={styles.navLabel}>{label}</span>
            </button>
          );
          return <li key={page}>{props.navCollapsed ? <Tooltip label={label}>{control}</Tooltip> : control}</li>;
        })}
      </ul>
      {props.navFooter && <div className={styles.navFooter}>{props.navFooter}</div>}
    </div></nav>
    <main className={styles.workspace} id="main-content"><div className={styles.workspaceInner}><header className={styles.workspaceHeader}>{props.header}</header>{props.content}</div></main>
    <aside className={styles.helper} data-collapsed={!props.helperOpen} aria-label={props.helperTitle}><div className={styles.helperInner}><div className={styles.helperHeader}><h2>{props.helperTitle}</h2><IconButton label={props.helperToggleLabel} leadingIcon={props.helperOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />} onPress={props.onToggleHelper} /></div><div className={styles.helperContent}>{props.helper}</div></div></aside>
  </div>;
}
