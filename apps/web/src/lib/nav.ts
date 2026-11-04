import type { IconName } from "@places/ui";
import { MODULE_LABEL as DOMAIN_MODULE_LABEL, type ModuleKey } from "@places/domain";

/** The side menu, from the demo: label, requirements code, icon, section. Only modules that are built are listed. */
export const NAV: Partial<Record<ModuleKey, { label: string; code: string; icon: IconName; section: string; short?: string; sub?: string }>> = {
  home: { label: "مهامي النهارده", code: "Today", icon: "home", section: "", short: "الرئيسية", sub: "اللي محتاج منك النهارده" },
  leads: { label: "العملاء المحتملين", code: "M-01", icon: "users", section: "المبيعات", short: "الليدز", sub: "Create lead · توزيع بالـ area · SLA · المراحل · Qualified · روتيشن No Answer" },
  inventory: { label: "مخزون الوحدات", code: "M-03", icon: "building", section: "العمليات", short: "الوحدات", sub: "Rent · Resale · Income في قايمة واحدة بفلتر، وتابات المساحات تحت زي الشيت" },
  access: { label: "الأدوار والصلاحيات", code: "M-09", icon: "lock", section: "النظام", short: "الصلاحيات", sub: "الأدوار ومصفوفة الصلاحيات · المستخدمين · Audit Log" },
  master: { label: "الإعدادات", code: "M-13", icon: "filter", section: "النظام", sub: "القوايم والقواعد اللي بيتبني عليها السيستم · بتتعدّل من غير برمجة" },
  integrations: { label: "الإشعارات والإيميل", code: "M-14", icon: "bolt", section: "النظام", short: "الإشعارات", sub: "الإشعارات بتوصل جوه السيستم وعلى الإيميل · قواعد كل حدث" },
};
export const SECTIONS = ["", "المبيعات", "العمليات", "الإدارة", "النظام"];
// the labels live in @places/domain so the API's Excel reports use the same words
export const MODULE_LABEL: Record<string, string> = DOMAIN_MODULE_LABEL;
