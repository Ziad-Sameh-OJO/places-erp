"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { IconName } from "@places/ui";
import { Empty, Icon } from "./ui";

/**
 * One line of «مهامي النهارده» (demo home.js `add(tone, ic, title, sub, act, data, btn)`). Each feature turns its own
 * items into lines, so the home page lists them without knowing the modules (a feature never imports another).
 */
export interface InboxLine {
  key: string; tone: "bad" | "warn" | ""; icon: IconName; title: string; sub: string; href: string; button: string;
  /** done right on the line instead of opening `href` (a screen the person can't open) */
  onClick?: () => void;
}

export function Inbox({ lines }: { lines: InboxLine[] }) {
  const t = useTranslations("ui.inbox");
  if (!lines.length) return <Empty text={t("empty")} icon="check" />;
  return (
    <ul className="inbox">
      {lines.map((x) => (
        <li key={x.key} className={x.tone}>
          {x.onClick ? (
            <button type="button" className="ib-row" onClick={x.onClick}>
              <span className="ib-ico"><Icon name={x.icon} /></span>
              <span className="ib-txt"><b>{x.title}</b><small>{x.sub}</small></span>
              <span className="ib-act">{x.button}</span>
            </button>
          ) : (
            <Link className="ib-row" href={x.href}>
              <span className="ib-ico"><Icon name={x.icon} /></span>
              <span className="ib-txt"><b>{x.title}</b><small>{x.sub}</small></span>
              <span className="ib-act">{x.button}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
