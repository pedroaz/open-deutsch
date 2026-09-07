import type { ReactNode } from "react";

import styles from "./Disclosure.module.css";

export function Disclosure(props: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`${styles.disclosure} ${props.className ?? ""}`}>
      <summary>{props.label}</summary>
      <div className={styles.content}>{props.children}</div>
    </details>
  );
}
