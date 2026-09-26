import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { Card } from "../ui/Surface.js";
import styles from "./Layout.module.css";

type PageProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
  width?: "standard" | "wide";
};

export function Page({
  actions,
  children,
  className,
  description,
  eyebrow,
  title,
  width = "standard",
  ...props
}: PageProps) {
  return (
    <section
      {...props}
      className={`${styles.page} ${width === "wide" ? styles.wide : ""} ${className ?? ""}`}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Stack(props: { children: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div
      className={`${styles.stack} ${props.compact ? styles.stackCompact : ""} ${props.className ?? ""}`}
    >
      {props.children}
    </div>
  );
}

export function Section(props: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  surface?: boolean;
  as?: ElementType;
  className?: string;
}) {
  const content = (
    <>
      {(props.title || props.description || props.actions) && (
        <header className={styles.sectionHeading}>
          <div>
            {props.title && <h2>{props.title}</h2>}
            {props.description && <p>{props.description}</p>}
          </div>
          {props.actions}
        </header>
      )}
      {props.children}
    </>
  );
  return props.surface ? (
    <Card as={props.as ?? "section"} className={`${styles.section} ${props.className ?? ""}`}>
      {content}
    </Card>
  ) : (
    <section className={`${styles.section} ${props.className ?? ""}`}>{content}</section>
  );
}

export function SectionHeader(props: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.sectionHeading} ${props.className ?? ""}`}>{props.children}</div>
  );
}

export function ActionGroup(props: { children: ReactNode; className?: string }) {
  return <div className={`${styles.actions} ${props.className ?? ""}`}>{props.children}</div>;
}

export function ContentGrid({
  children,
  columns = 2,
  className,
  fillLast,
  ...props
}: ComponentPropsWithoutRef<"div"> & { columns?: 1 | 2; fillLast?: boolean }) {
  return (
    <div
      {...props}
      className={`${styles.grid} ${columns === 1 ? "" : styles.twoColumns} ${fillLast ? styles.fillLast : ""} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
export const FormGrid = ContentGrid;
type FilterBarProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  label: string;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function FilterBar<T extends ElementType = "div">({
  as,
  children,
  className,
  columns = 3,
  label,
  ...props
}: FilterBarProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      {...props}
      aria-label={label}
      className={`${styles.filterBar} ${className ?? ""}`}
      data-columns={columns}
    >
      {children}
    </Component>
  );
}
