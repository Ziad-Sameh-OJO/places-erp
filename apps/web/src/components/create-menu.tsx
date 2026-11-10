"use client";
/**
 * 0.16 · «جديد» from any page (demo shell.js createItems / openCreate, mobile.js #fab): a menu in the top bar on
 * desktop, the «+» at the bottom on phones (a sheet). Each item shows only with the module's «create» permission
 * (the API refuses anyway) and opens that page's own form through «?new=…» (lib/new-param).
 */
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { IconName } from "@places/ui";
import type { ModuleKey } from "@places/domain";
import { Icon, Modal } from "./ui";

type Key = "lead" | "bulk" | "deal" | "unit" | "campaign" | "post" | "purchase" | "user" | "ticket" | "leave";
interface Item { key: Key; href: string; icon: IconName; kbd?: string; module?: ModuleKey; action?: "create" | "import" }
const ITEMS: Item[] = [
  { key: "lead", href: "/leads?new=1", icon: "users", kbd: "N", module: "leads" },
  { key: "bulk", href: "/leads?new=bulk", icon: "upload", module: "leads", action: "import" }, // demo: Telesales / admin
  { key: "deal", href: "/deals?new=1", icon: "handshake", module: "deals" },
  { key: "unit", href: "/inventory?new=1", icon: "building", module: "inventory" },
  { key: "campaign", href: "/marketing?new=campaign", icon: "megaphone", module: "marketing" },
  { key: "post", href: "/marketing?new=post", icon: "calendar", module: "marketing" },
  { key: "purchase", href: "/procurement?new=1", icon: "cart", module: "procurement" },
  { key: "user", href: "/access?new=1", icon: "lock", module: "access" },
  { key: "ticket", href: "/tickets?new=1", icon: "ticket", module: "tickets" },
  { key: "leave", href: "/profile?new=leave", icon: "calendar" }, // everyone's own request
];

export function CreateMenu({ can }: { can: (m: ModuleKey, a: "create" | "import") => boolean }) {
  const t = useTranslations("common.create");
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState<"menu" | "sheet" | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const items = ITEMS.filter((i) => !i.module || can(i.module, i.action ?? "create"));
  // the form opens on the page's first render: on the page already on screen, load it again
  const go = (href: string) => {
    setOpen(null);
    if (href.split("?")[0] === path) window.location.assign(href);
    else router.push(href);
  };
  useEffect(() => {
    if (open !== "menu") return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  // «N» = a new lead, as the demo's menu shows (not while typing)
  const lead = items.find((i) => i.key === "lead");
  useEffect(() => {
    if (!lead) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      go(lead.href);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  if (!items.length) return null;
  const list = items.map((i) => (
    <button key={i.key} className="cm-item" onClick={() => go(i.href)}><Icon name={i.icon} /><span>{t(`items.${i.key}`)}</span>{i.kbd && <kbd>{i.kbd}</kbd>}</button>
  ));
  return (
    <>
      <div ref={box} style={{ display: "contents" }}>
        <button className="btn create-btn" id="createBtn" aria-haspopup="true" aria-expanded={open === "menu"} onClick={() => setOpen(open === "menu" ? null : "menu")}><Icon name="plus" /><span>{t("button")}</span></button>
        {open === "menu" && <div className="create-menu" id="createMenu" role="menu"><strong>{t("title")}</strong>{list}</div>}
      </div>
      <button className="fab" id="fab" aria-label={t("button")} onClick={() => setOpen("sheet")}><Icon name="plus" /></button>
      {open === "sheet" && <Modal title={t("title")} onClose={() => setOpen(null)}><div className="cm-sheet">{list}</div></Modal>}
    </>
  );
}
