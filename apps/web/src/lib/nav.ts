import type { IconName } from "@places/ui";
import type { ModuleKey } from "@places/domain";

/** The side menu, from the demo: label, requirements code, icon, section. Only modules that are built are listed. */
export const NAV: Partial<Record<ModuleKey, { label: string; code: string; icon: IconName; section: string; short?: string; sub?: string }>> = {
  home: { label: "مهامي النهارده", code: "Today", icon: "home", section: "", short: "الرئيسية", sub: "اللي محتاج منك النهارده" },
  leads: { label: "العملاء المحتملين", code: "M-01", icon: "users", section: "المبيعات", short: "الليدز", sub: "Create lead · توزيع بالـ area · SLA · المراحل · Qualified · روتيشن No Answer" },
  settings: { label: "قواعد الليدز والتوزيع", code: "Routing", icon: "route", section: "المبيعات", short: "قواعد الليدز", sub: "التوزيع والمواعيد والـ SLA والـ No Answer والإقفال · كل رقم وكل شخص مسؤول بيتعدّل من هنا" },
  inventory: { label: "مخزون الوحدات", code: "M-03", icon: "building", section: "العمليات", short: "الوحدات", sub: "Rent · Resale · Income في قايمة واحدة بفلتر، وتابات المساحات تحت زي الشيت" },
  access: { label: "الأدوار والصلاحيات", code: "M-09", icon: "lock", section: "النظام", short: "الصلاحيات", sub: "الأدوار ومصفوفة الصلاحيات · المستخدمين · Audit Log" },
  master: { label: "الإعدادات", code: "M-13", icon: "filter", section: "النظام", sub: "القوايم والقواعد اللي بيتبني عليها السيستم · بتتعدّل من غير برمجة" },
  integrations: { label: "الإشعارات والإيميل", code: "M-14", icon: "bolt", section: "النظام", short: "الإشعارات", sub: "الإشعارات بتوصل جوه السيستم وعلى الإيميل · قواعد كل حدث" },
};
export const SECTIONS = ["", "المبيعات", "العمليات", "الإدارة", "النظام"];
export const MODULE_LABEL: Record<string, string> = {
  home: "الرئيسية", leads: "العملاء المحتملين", deals: "الصفقات", settings: "إعدادات التوزيع", clients: "العملاء والملاك",
  contracts: "العقود والتحصيل", inventory: "مخزون الوحدات", notactive: "Not Active", tasks: "المهام", marketing: "التسويق",
  hr: "الموارد البشرية", tickets: "التذاكر", finance: "المالية", procurement: "المشتريات", reports: "التقارير والتارجت",
  kpis: "مؤشرات الأداء", access: "الأدوار والصلاحيات", master: "الإعدادات", integrations: "الإشعارات والإيميل",
};
