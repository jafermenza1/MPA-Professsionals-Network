import type { ReactNode } from "react";
import styles from "./admin-page-header.module.css";

type AdminPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function AdminPageHeader({ eyebrow, title, description, actions }: AdminPageHeaderProps) {
  return <header className={styles.header}>
    <div className={styles.copy}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p className={styles.description}>{description}</p>
    </div>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </header>;
}
