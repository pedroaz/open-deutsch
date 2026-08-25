import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  FieldError,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  Text,
  TextField,
  type ButtonProps,
} from "react-aria-components";

import styles from "./Foundation.module.css";

export function AppButton({
  variant = "secondary",
  className,
  ...props
}: Omit<ButtonProps, "className"> & {
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  return <Button {...props} className={`${styles.button} ${styles[variant]} ${className ?? ""}`} />;
}

export function SurfaceCard({ children }: { children: ReactNode }) {
  return <article className={styles.card}>{children}</article>;
}

export function FormField(props: {
  label: string;
  hint: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <TextField
      className={styles.field}
      {...(props.defaultValue === undefined ? {} : { defaultValue: props.defaultValue })}
      isInvalid={props.error !== undefined}
      isRequired
    >
      <Label>{props.label}</Label>
      <Input />
      <Text className={styles.hint} slot="description">
        {props.hint}
      </Text>
      {props.error && <FieldError className={styles.fieldError}>{props.error}</FieldError>}
    </TextField>
  );
}

export function StatusMessage(props: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const tone = props.tone ?? "neutral";
  return (
    <div
      className={`${styles.status} ${tone === "neutral" ? "" : styles[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {props.children}
    </div>
  );
}

export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <StatusMessage>
      <span className={styles.loadingDot} aria-hidden="true" /> {children}
    </StatusMessage>
  );
}

export function ItemList({ items }: { items: readonly string[] }) {
  return (
    <ul className={styles.itemList}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function InlineDiff(props: { original: string; corrected: string; description: string }) {
  return (
    <div>
      <p className={styles.inlineDiff}>
        <del>{props.original}</del> <span aria-hidden="true"> → </span>
        <ins>{props.corrected}</ins>
      </p>
      <p>{props.description}</p>
    </div>
  );
}

export function SideBySideDiff(props: {
  originalLabel: string;
  correctedLabel: string;
  original: string;
  corrected: string;
}) {
  return (
    <div className={styles.diffGrid}>
      <article className={styles.diffPane}>
        <strong>{props.originalLabel}</strong>
        <p>{props.original}</p>
      </article>
      <article className={styles.diffPane}>
        <strong>{props.correctedLabel}</strong>
        <p>{props.corrected}</p>
      </article>
    </div>
  );
}

export function Disclosure(props: { label: string; children: ReactNode }) {
  return (
    <details className={styles.disclosure}>
      <summary>{props.label}</summary>
      <div>{props.children}</div>
    </details>
  );
}

export function DestructiveDialog(props: {
  trigger: string;
  triggerVariant?: "primary" | "secondary" | "danger";
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  onConfirm?: () => void;
}) {
  return (
    <DialogTrigger>
      <AppButton variant={props.triggerVariant ?? "danger"}>{props.trigger}</AppButton>
      <ModalOverlay className={styles.modalOverlay} isDismissable>
        <Modal className={styles.modal}>
          <Dialog>
            {({ close }) => (
              <>
                <Heading slot="title">{props.title}</Heading>
                <p>{props.body}</p>
                <div className={styles.actions}>
                  <AppButton
                    variant="danger"
                    onPress={() => {
                      close();
                      props.onConfirm?.();
                    }}
                  >
                    {props.confirm}
                  </AppButton>
                  <AppButton onPress={close}>{props.cancel}</AppButton>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
