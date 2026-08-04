import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "ar" | "en";

type Dict = Record<string, { ar: string; en: string }>;

const dict: Dict = {
  "app.name": { ar: "شركة نقل المياه", en: "Water Transmission Company" },
  "app.short": { ar: "نظام إدارة القراءات والتقارير", en: "Readings & Reports Management" },
  "nav.dashboard": { ar: "لوحة التحكم", en: "Dashboard" },
  "nav.readings": { ar: "القراءات", en: "Readings" },
  "nav.incidents": { ar: "الحوادث", en: "Incidents" },
  "nav.stations": { ar: "المحطات", en: "Stations" },
  "nav.templates": { ar: "قوالب القراءات", en: "Reading Templates" },
  "nav.users": { ar: "المستخدمون", en: "Users" },
  "nav.reports": { ar: "التقارير", en: "Reports" },
  "nav.availability": { ar: "التقرير الصباحي اليومي", en: "Morning Daily Report (MDR)" },
  "nav.firepump": { ar: "اختبار مضخات الحريق", en: "Fire Pump Test" },
  "nav.generator": { ar: "اختبار مولد الطوارئ", en: "Emergency Generator Test" },
  "nav.signout": { ar: "تسجيل الخروج", en: "Sign Out" },

  "auth.title": { ar: "تسجيل الدخول", en: "Sign In" },
  "auth.subtitle": { ar: "أدخل رقم الموظف وكلمة السر", en: "Enter your employee number and password" },
  "auth.employee_no": { ar: "رقم الموظف", en: "Employee Number" },
  "auth.password": { ar: "كلمة السر", en: "Password" },
  "auth.signin": { ar: "دخول", en: "Sign In" },
  "auth.invalid": { ar: "رقم موظف أو كلمة سر غير صحيحة", en: "Invalid employee number or password" },
  "auth.inactive": { ar: "الحساب معطّل. راجع المسؤول.", en: "Account disabled. Contact admin." },
  "auth.contact_admin": { ar: "الحسابات ينشئها المسؤول فقط", en: "Accounts are created by admin only" },

  "role.admin": { ar: "مسؤول", en: "Admin" },
  "role.supervisor": { ar: "مشرف", en: "Supervisor" },
  "role.operator": { ar: "مشغّل", en: "Operator" },
  "role.viewer": { ar: "مشاهد", en: "Viewer" },

  "common.save": { ar: "حفظ", en: "Save" },
  "common.cancel": { ar: "إلغاء", en: "Cancel" },
  "common.delete": { ar: "حذف", en: "Delete" },
  "common.edit": { ar: "تعديل", en: "Edit" },
  "common.add": { ar: "إضافة", en: "Add" },
  "common.loading": { ar: "جارٍ التحميل…", en: "Loading…" },
  "common.language": { ar: "اللغة", en: "Language" },
  "common.actions": { ar: "الإجراءات", en: "Actions" },
  "common.search": { ar: "بحث", en: "Search" },
  "common.station": { ar: "المحطة", en: "Station" },
  "common.date": { ar: "التاريخ", en: "Date" },
  "common.status": { ar: "الحالة", en: "Status" },
  "common.description": { ar: "الوصف", en: "Description" },
  "common.value": { ar: "القيمة", en: "Value" },

  "dash.title": { ar: "نظرة عامة", en: "Overview" },
  "dash.today_readings": { ar: "قراءات اليوم", en: "Today's Readings" },
  "dash.open_incidents": { ar: "حوادث مفتوحة", en: "Open Incidents" },
  "dash.stations_active": { ar: "محطات نشطة", en: "Active Stations" },
  "dash.recent_incidents": { ar: "آخر الحوادث", en: "Recent Incidents" },
  "dash.welcome": { ar: "مرحباً", en: "Welcome" },
};

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof typeof dict | string) => string;
  dir: "rtl" | "ltr";
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("wtco-locale") as Locale | null) : null;
    if (saved === "ar" || saved === "en") setLocaleState(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem("wtco-locale", l);
  };

  const t = (key: string) => {
    const entry = dict[key];
    if (!entry) return key;
    return entry[locale] ?? key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir: locale === "ar" ? "rtl" : "ltr" }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside I18nProvider");
  return ctx;
}
