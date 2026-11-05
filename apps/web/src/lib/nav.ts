import type { IconName } from "@places/ui";
import { MODULE_LABEL as DOMAIN_MODULE_LABEL, type ModuleKey } from "@places/domain";

/** The side menu, from the demo: label, requirements code, icon, section. Only modules that are built are listed. */
export const NAV: Partial<Record<ModuleKey, { label: string; code: string; icon: IconName; section: string; short?: string; sub?: string }>> = {
  home: { label: "مهامي النهارده", code: "Today", icon: "home", section: "", short: "الرئيسية", sub: "اللي محتاج منك النهارده" },
  leads: { label: "العملاء المحتملين", code: "M-01", icon: "users", section: "المبيعات", short: "الليدز", sub: "Create lead · توزيع بالـ area · SLA · المراحل · Qualified · روتيشن No Answer" },
  settings: { label: "قواعد الليدز والتوزيع", code: "Routing", icon: "route", section: "المبيعات", short: "قواعد الليدز", sub: "التوزيع والمواعيد والـ SLA والـ No Answer والإقفال · كل رقم وكل شخص مسؤول بيتعدّل من هنا" },
  inventory: { label: "مخزون الوحدات", code: "M-03", icon: "building", section: "العمليات", short: "الوحدات", sub: "Rent · Resale · Income في قايمة واحدة بفلتر، وتابات المساحات تحت زي الشيت" },
  notactive: { label: "Not Active Inventory", code: "M-03", icon: "layers", section: "العمليات", short: "Not Active", sub: "شيتات بتترفع Excel · دمج من غير تكرار · مروة بتصنّف كل رقم · Done بيدخّل وحدة جديدة" },
  finance: { label: "المالية", code: "M-07", icon: "wallet", section: "الإدارة", sub: "الداشبورد · الخزن والحركات · العهد والسلف · القيود · الفواتير الثابتة · قايمة الدخل والميزانية · البادجت · شجرة الحسابات" },
  procurement: { label: "المشتريات", code: "M-08", icon: "cart", section: "الإدارة", sub: "Request ← موافقة (لحد 50,000 أي معتمد · أكتر من كده أحمد أو صفوت) ← مختار يصرف ← Budget البند بعد الدفع" },
  hr: { label: "الموارد البشرية", code: "M-05", icon: "id", section: "الإدارة", short: "الـ HR", sub: "الحضور بالبصمة والشرايح · التاريخ · الـ Weekly Delay · فايل كل موظف" },
  reports: { label: "التقارير والتارجت", code: "M-12", icon: "chart", section: "الإدارة", short: "التقارير", sub: "التارجت الشهري · الـ Team Leaders · تقارير متجدولة" },
  kpis: { label: "مؤشرات الأداء (KPIs)", code: "M-12", icon: "trend", section: "الإدارة", short: "الـ KPIs", sub: "كارت كل موظف للربع · المدير بيتحكم في بنود فريقه" },
  tickets: { label: "التذاكر", code: "M-06", icon: "ticket", section: "الإدارة", sub: "الطلبات بين الأقسام بدل الواتساب · Audit Trail" },
  access: { label: "الأدوار والصلاحيات", code: "M-09", icon: "lock", section: "النظام", short: "الصلاحيات", sub: "الأدوار ومصفوفة الصلاحيات · المستخدمين · Audit Log" },
  master: { label: "الإعدادات", code: "M-13", icon: "filter", section: "النظام", sub: "القوايم والقواعد اللي بيتبني عليها السيستم · بتتعدّل من غير برمجة" },
  integrations: { label: "الإشعارات والإيميل", code: "M-14", icon: "bolt", section: "النظام", short: "الإشعارات", sub: "الإشعارات بتوصل جوه السيستم وعلى الإيميل · قواعد كل حدث" },
};
export const SECTIONS = ["", "المبيعات", "العمليات", "الإدارة", "النظام"];
// the labels live in @places/domain so the API's Excel reports use the same words
export const MODULE_LABEL: Record<string, string> = DOMAIN_MODULE_LABEL;
