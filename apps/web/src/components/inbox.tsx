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
}

export function Inbox({ lines }: { lines: InboxLine[] }) {
  const t = useTranslations("ui.inbox");
  if (!lines.length) return <Empty text={t("empty")} icon="check" />;
  return (
    <ul className="inbox">
      {lines.map((x) => (
        <li key={x.key} className={x.tone}>
          <span className="ib-ico"><Icon name={x.icon} /></span>
          <div className="ib-txt"><b>{x.title}</b><small>{x.sub}</small></div>
          <Link className={`btn sm ${x.tone === "bad" ? "" : "ghost"}`} href={x.href}>{x.button}</Link>
        </li>
      ))}
    </ul>
  );
}
