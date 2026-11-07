import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // leads.ts (push title fallback)
  ["الليدز", "Leads"],
  // contract-renewal.ts — the longer form first: the first template that matches wins
  ["العقد {code} ({company} · {unit}) بينتهي بعد {days} يوم · {endsOn} · اتعمل ليد تجديد {lead}", "Contract {code} ({company} · {unit}) ends in {days} days · {endsOn} · renewal Lead {lead} was created"],
  ["العقد {code} ({company} · {unit}) بينتهي بعد {days} يوم · {endsOn}", "Contract {code} ({company} · {unit}) ends in {days} days · {endsOn}"],
  ["تجديد العقد {code} · ينتهي {endsOn}", "Contract {code} renewal · ends {endsOn}"],
  ["ليد تجديد من العقد {code}", "Renewal Lead from contract {code}"],
  // draft-admin-alarm.ts
  ["Alarm: {waiting} Not Interested / Cancellation مستنيين قرارك · {today} النهارده", "Alarm: {waiting} Not Interested / Cancellation waiting for your decision · {today} today"],
  ["Alarm: {waiting} Not Interested / Cancellation مستنيين قرارك", "Alarm: {waiting} Not Interested / Cancellation waiting for your decision"],
  // draft.ts
  ["اتسحب أوتوماتيك من {from} للـ Draft بعد {days} يوم من غير أكشن (Hold)", "Pulled automatically from {from} to Draft after {days} days with no action (Hold)"],
  ["اتسحب أوتوماتيك من {from} للـ Draft بعد {days} يوم من غير أكشن", "Pulled automatically from {from} to Draft after {days} days with no action"],
  ["{lead} ({code}) اتسحب من {from} للـ Draft · {days} يوم من غير أكشن", "{lead} ({code}) was pulled from {from} to Draft · {days} days with no action"],
  // hr-action-alarm.ts
  ["ميعاد حل الـ HR مع {name}: {action}", "Time for the HR resolution with {name}: {action}"],
  // installment-alerts.ts — written out in full so the whole line comes out in English
  ["تصعيد: قسط العقد {code} ({company}) · {owed} · ميعاده {dueOn} · متأخر 7 أيام أو أكتر", "Escalation: contract {code} installment ({company}) · {owed} · due {dueOn} · 7 days or more late"],
  ["قسط العقد {code} ({company}) · {owed} · ميعاده {dueOn} · فاضل {days} يوم", "Contract {code} installment ({company}) · {owed} · due {dueOn} · {days} days left"],
  ["قسط العقد {code} ({company}) · {owed} · ميعاده {dueOn} · اتأخر ومتحصّلش", "Contract {code} installment ({company}) · {owed} · due {dueOn} · late and not collected"],
  ["قسط العقد {code} ({company}) · {owed} · ميعاده {dueOn}", "Contract {code} installment ({company}) · {owed} · due {dueOn}"],
  // inventory-report.ts
  ["«{name}» جاهز · مستني اعتمادك", "«{name}» is ready · waiting for your approval"],
  // kpi-mid-quarter.ts
  ["نص {quarter}: {count} بند تحت المستهدف في كارت {name} ({items})", "Mid {quarter}: {count} items below target on {name}'s card ({items})"],
  // kpi-refresh.ts
  ["السيستم حدّث {count} بند أوتوماتيك من الموديولات", "The system updated {count} items automatically from the modules"],
  // lead-sla.ts
  ["تنبيه SLA: {lead} ({code}) من غير أكشن عند {name}", "SLA alert: {lead} ({code}) has no action with {name}"],
  ["اتسحب أوتوماتيك من {from} بعد {after} من غير أكشن، وراح لـ {to}", "Pulled automatically from {from} after {after} with no action, and went to {to}"],
  ["الليد {code} ({lead}) اتسحب من {from} وراح لـ {to}", "Lead {code} ({lead}) was pulled from {from} and went to {to}"],
  // leave-chase.ts
  ["طلب إجازة {name} مستني ردك من 24 ساعة", "{name}'s leave request has been waiting for your reply for 24 hours"],
  ["طلب إجازة {name} عدّى 48 ساعة من غير رد من الـ Team Leader", "{name}'s leave request passed 48 hours with no reply from the Team Leader"],
  // mail-outbox.ts
  ["{label}: «{subject}» لـ {to} · {message}", "{label}: «{subject}» to {to} · {message}"],
  // no-answer-reminder.ts
  ["Alarm: كلّم {name} (No Answer) · سجّل المكالمة", "Alarm: call {name} (No Answer) · log the call"],
  // no-answer.ts
  ["No Answer: عدّى {hours} عند {from} وراح لـ {to} (رجع Fresh)", "No Answer: {hours} passed with {from} and it went to {to} (back to Fresh)"],
  ["ليد {lead} جالك بعد No Answer عند {from}", "Lead {lead} came to you after No Answer with {from}"],
  ["الروتيشن رقم {rotation}: الليد راح لـ Telesales ({name})", "Rotation {rotation}: the Lead went to Telesales ({name})"],
  ["ليد {name} رجعلك في الروتيشن التالت", "Lead {name} came back to you in the third rotation"],
  // payroll-due.ts
  ["اصرف مرتبات {month} · {count} موظف · إجمالي {gross}", "Pay {month} salaries · {count} employees · total {gross}"],
  // post-reminder.ts
  ["Reminder: ميعاد بوست «{title}» على {channel} دلوقتي", "Reminder: post «{title}» on {channel} is due now"],
  // procurement-reminder.ts
  ["تذكير: طلب شراء PR-{no} ({item}) مستني موافقتك من يوم شغل", "Reminder: purchase request PR-{no} ({item}) has been waiting for your approval for a working day"],
  // recurring-bills.ts
  ["ميعاد فاتورة {name} · {amount} · {vendor} · مستنية موافقتك", "{name} bill is due · {amount} · {vendor} · waiting for your approval"],
  // scheduled-reports.ts (Excel headers, titles, notifications)
  ["الاسم", "Name"],
  ["الفريق", "Team"],
  ["التارجت الشهري", "Monthly target"],
  ["دخل في التارجت", "Counted toward target"],
  ["النسبة من التارجت", "% of target"],
  ["الفترة اللي قبلها", "Previous period"],
  ["الفرق", "Difference"],
  ["فريق {name}", "{name}'s team"],
  ["تقرير الأداء الشهري", "Monthly performance report"],
  ["تقرير الأداء", "Performance report"],
  ["اتبعت تقرير «{name}» ({fmt}) · {title}", "Report «{name}» ({fmt}) was sent · {title}"],
  ["تذكير: سلّم «{name}» قبل {due}", "Reminder: hand in «{name}» before {due}"],
  ["حد", "Someone"],
  ["{who} ماسلّمش «{name}» في ميعاده ({due})", "{who} didn't hand in «{name}» on time ({due})"],
  // stale-units.ts
  ["متابعة مع المالك: {code} ({project}) · الـ last update عدّى عليه أكتر من شهر", "Follow up with the owner: {code} ({project}) · last update is more than a month old"],
  ["last update عدّى عليه أكتر من شهر · كلّم المالك", "Last update is more than a month old · call the owner"],
  // target-pace.ts
  ["تحت معدل التارجت: {names}", "Behind target pace: {names}"],
  // ticket-sla.ts
  ["نزاع TK-{number} عدّى {hours} ساعة من غير ما يتحسم: {title}", "Dispute TK-{number} passed {hours} hours without being settled: {title}"],
  ["تذكرة TK-{number} لقسم {department} اتأخرت من غير رد · اتصعّدت ليك: {title}", "Ticket TK-{number} for {department} is late with no reply · escalated to you: {title}"],
  ["عدّت الـ {hours} ساعة من غير ما يتحسم · اتبلّغت الـ Office Manager", "{hours} hours passed without being settled · the Office Manager was told"],
  ["اتأخرت · اتصعّدت لمدير قسم {department}", "Late · escalated to the {department} manager"],
  // visit-alarm.ts
  ["Alarm: ميعاد الـ {kind} مع {name} جه · دوس Done", "Alarm: the {kind} with {name} is due · press Done"],
] satisfies Pair[];
