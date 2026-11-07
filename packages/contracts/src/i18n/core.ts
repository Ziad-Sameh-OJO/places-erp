import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // the web's own fallbacks (apps/web/src/lib/api.ts)
  ["حصل خطأ في السيستم · جرّب تاني كمان شوية", "Something went wrong in the system · try again in a little while"],
  ["مفيش اتصال بالسيستم · اتأكد من النت وجرّب تاني", "Can't reach the system · check your connection and try again"],
  // auth/auth.service.ts
  ["الإيميل أو الباسورد غلط", "Wrong email or password"],
  ["الحساب مقفول · كلّم الأدمن", "The account is locked · contact the admin"],
  ["دخول غريب: حساب {email} اتقفل بعد {max} محاولات دخول غلط من {ip}", "Suspicious sign-in: account {email} was locked after {max} wrong sign-in attempts from {ip}"],
  ["دخول غريب: حساب {email} اتقفل بعد {max} محاولات دخول غلط", "Suspicious sign-in: account {email} was locked after {max} wrong sign-in attempts"],
  ["كود الدخول: {code}", "Sign-in code: {code}"],
  ["كود الدخول على Places ERP: {code}\nصالح 10 دقايق. لو مش إنت اللي بتحاول تدخل، غيّر الباسورد.", "Your Places ERP sign-in code: {code}\nValid for 10 minutes. If you aren't the one signing in, change your password."],
  ["الكود خلص · ارجع وادخل بالباسورد تاني", "The code expired · go back and sign in with your password again"],
  ["تقدر تطلب كود تاني بعد {wait} ثانية", "You can ask for another code in {wait} seconds"],
  ["الكود غلط أو خلص", "The code is wrong or expired"],
  ["اللينك خلص أو اتستخدم قبل كده", "The link expired or was already used"],
  ["تغيير الباسورد · Places ERP", "Change password · Places ERP"],
  ["علشان تعمل باسورد جديد افتح اللينك ده (صالح 30 دقيقة):\n{origin}/reset?token={t}\nلو مش إنت اللي طلبت، تجاهل الإيميل.", "To set a new password open this link (valid for 30 minutes):\n{origin}/reset?token={t}\nIf you didn't ask for this, ignore this email."],
  ["فعّل حسابك على Places ERP", "Activate your Places ERP account"],
  ["اتعملك حساب بدور {role}. افتح اللينك ده واعمل الباسورد بتاعك (صالح 7 أيام):\n{origin}/activate?token={t}", "An account was created for you as {role}. Open this link and set your password (valid for 7 days):\n{origin}/activate?token={t}"],
  ["الباسورد الحالي غلط", "The current password is wrong"],
  // documents (test PDF; the PDF itself is printed in Arabic)
  ["مستند تجريبي", "Test document"],
  ["مستند تجريبي.pdf", "Test document.pdf"],
  ["دفعة أولى", "First payment"],
  ["دفعة تانية", "Second payment"],
  ["الباقي عند التسليم", "Balance on delivery"],
  ["الختم", "Stamp"],
  ["الإمضا", "Signature"],
  // files/files.service.ts
  ["الملف مش موجود", "The file doesn't exist"],
  ["الملف ده اتأكد قبل كده", "This file was already confirmed"],
  ["الملف لسه مترفعش", "The file hasn't been uploaded yet"],
  ["الملف اللي اترفع مش مطابق للي اتطلب", "The uploaded file doesn't match what was requested"],
  ["فيه مرفق مش موجود أو لسه مترفعش", "An attachment doesn't exist or hasn't been uploaded yet"],
  // http/import.ts (sheet imports)
  ["ارفع ملف Excel أو CSV", "Upload an Excel or CSV file"],
  ["أعمدة ناقصة في الشيت · نزّل القالب", "Columns are missing in the sheet · download the template"],
  ["الشيت أكبر من {limit} صف · قسّمه", "The sheet has more than {limit} rows · split it"],
  ["مكرر مع السطر {line}", "Duplicate of line {line}"],
  ["أول صف في الشيت لازم يبقى العناوين", "The first row of the sheet must be the headers"],
  ["الملف مش Excel (.xlsx) ولا CSV", "The file isn't Excel (.xlsx) or CSV"],
  ["مكرر مع {sheet} · السطر {line}", "Duplicate of {sheet} · line {line}"],
  ["{sheet} · السطر {line}", "{sheet} · line {line}"],
  ["الملف فاضي", "The file is empty"],
  // notifications/notifications.controller.ts
  ["إشعار تجربة", "Test notification"],
  ["الإشعارات شغالة على الجهاز ده", "Notifications work on this device"],
] satisfies Pair[];
