/**
 * 13.4 · the demo's «جولة سريعة للكلاينت» (demo/design-2/js/shell.js, TOUR) on the real web app: each step signs in as the
 * demo's person, opens the screen and the tab, and finds what the tour points at — on a desktop and on a 375px phone.
 * Only the screens built so far. Not here yet (screen or element not built): البداية/الرئيسية, الصفقات, التقارير, الـ KPIs,
 * المهام والتسويق, العملاء والعقود, Not Active Inventory, الديمو; and inside built screens: مكالمات التحقق، الإدخال الجماعي،
 * شيت الشركات، طلبات الـ Lists، تقرير منار اليومي، Cost Center، الموظف المثالي وصندوق الفريق، شرايح الـ HR.
 * Run: `pnpm --filter @places/web test:browser`, with the API and the web app running (WEB_URL, default :3000) on a seeded database.
 */
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import type { Page } from "playwright-core";
import { WEB, as, close, done } from "./browser.ts";

type Step = { as: string; go: string; t: string; tab?: string; sel?: string; act?: (page: Page) => Promise<unknown> };

const stamp = String(Date.now()).slice(-8);
const leadName = `عميل جولة ${stamp}`;
let made = 0;
const shown = (page: Page, sel: string) => page.locator(sel).first().waitFor();

const TOUR: [string, Step[]][] = [
  ["الليدز", [
    { as: "u6", go: "leads", t: "هبة بتسجّل الليد", act: async (page) => {
      await page.getByRole("button", { name: "ليد جديد" }).filter({ visible: true }).first().click();
      const form = page.getByRole("dialog", { name: "ليد جديد" });
      await form.locator("[name=name]").fill(leadName);
      await form.locator("[name=phones]").fill(`${["010", "011"][made++]}${stamp}`) // one new lead per screen width;
      await form.locator("[name=area]").selectOption("التجمع الخامس");
      await form.locator("[name=channel]").selectOption("Facebook");
      await form.locator("[name=assignToId]").selectOption({ label: "محمد محسن" });
      await form.getByRole("button", { name: "حفظ الليد" }).click();
      await page.getByText("الليد راح لـ محمد محسن").waitFor();
    } },
    { as: "u6", go: "leads", t: "فلاتر وعروض محفوظة", sel: ".toolbar" },
    { as: "u6", go: "leads", t: "جدول ذكي أو Kanban", act: async (page) => { await page.getByRole("button", { name: "Kanban" }).click(); await shown(page, ".leads-board"); } },
    { as: "s1", go: "leads", t: "ملف الليد عند السيلز", act: async (page) => { await page.getByText(leadName).first().click(); await shown(page, ".drawer"); } },
    { as: "u6", go: "settings", t: "إعدادات التوزيع", sel: "#view .tabs" },
  ]],
  ["الانفنتوري", [
    { as: "u7", go: "inventory", t: "مخزون الوحدات", sel: ".tabs" },
    { as: "u7", go: "inventory", t: "شيت أو فولدرات", act: async (page) => {
      await page.getByRole("button", { name: "فولدرات" }).click();
      assert.equal(await page.getByRole("button", { name: "فولدرات" }).getAttribute("aria-pressed"), "true");
    } },
  ]],
  ["الـ HR", [
    { as: "u14", go: "hr", tab: "حضور النهارده", t: "الحضور والبصمة", sel: ".tabs" },
    { as: "u14", go: "hr", tab: "Weekly Delay", t: "Weekly Delay", sel: "#view table, #view .empty" },
    { as: "u14", go: "hr", tab: "الموظفين", t: "الموظفين و1-to-1", sel: "#view table" },
    { as: "u14", go: "hr", tab: "الإجازات", t: "الإجازات والطلبات", sel: "#view .card" },
  ]],
  ["التذاكر والمشتريات", [
    { as: "s1", go: "tickets", t: "التذاكر بين الأقسام", act: (page) => page.getByRole("button", { name: "تذكرة جديدة" }).first().waitFor() },
    { as: "u16", go: "procurement", t: "طلب شراء أو دفع", act: (page) => page.getByRole("button", { name: "طلب شراء / دفع" }).filter({ visible: true }).first().waitFor() },
    { as: "u16", go: "procurement", t: "عهدة مختار وأصول المكتب", act: (page) => page.getByRole("button", { name: "اتراجع الشهر ده" }).waitFor() },
    { as: "u18", go: "procurement", t: "الـ Budget لكل بند", sel: "#view .card" },
  ]],
  ["المالية", [
    { as: "u18", go: "finance", tab: "Dashboard", t: "Dashboard المالية", sel: "#view .card" },
    { as: "u18", go: "finance", tab: "قايمة الدخل", t: "قايمة الدخل والميزانية", sel: ".pnl table" },
    { as: "u18", go: "finance", tab: "الميزانية العمومية", t: "الميزانية العمومية", sel: "#view .cols" },
    { as: "u18", go: "finance", tab: "المرتبات", t: "المرتبات", sel: "#view .card" },
    { as: "u18", go: "finance", tab: "شجرة الحسابات", t: "شجرة الحسابات", sel: ".tree.coa" },
  ]],
  ["الإدارة والنظام", [
    { as: "u1", go: "access", tab: "الأدوار والصلاحيات", t: "الأدوار", sel: "#view .card" },
    { as: "u1", go: "access", tab: "الأدوار والصلاحيات", t: "مصفوفة الصلاحيات", sel: "table.perm" },
    { as: "u1", go: "access", tab: "المستخدمين", t: "المستخدمين", sel: "#view table" },
    { as: "u1", go: "access", tab: "Audit Log", t: "Audit Log", sel: "#view table" },
    { as: "u1", go: "master", tab: "القوايم", t: "الإعدادات والقوايم", sel: ".tabs" },
    { as: "u1", go: "integrations", t: "الإشعارات والإيميل", sel: "#view .card" },
  ]],
];

after(close);

for (const width of [1366, 375]) {
  describe(`${width}px`, { concurrency: false }, () => {
    for (const [sec, steps] of TOUR) for (const s of steps) {
      test(`${sec} · ${s.t}`, async () => {
        const b = await as(s.as, width);
        await b.page.goto(`${WEB}/${s.go}`);
        if (s.tab) await b.page.getByRole("tab", { name: s.tab, exact: true }).click();
        await (s.act ? s.act(b.page) : shown(b.page, s.sel!));
        await done(b);
      });
    }
  });
}
