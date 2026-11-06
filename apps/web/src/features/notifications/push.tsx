"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Note, useAction } from "@/components/ui";

type State = "loading" | "unsupported" | "off-server" | "blocked" | "on" | "off";

/** The VAPID public key as the browser wants it (base64url → bytes). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** This device's push subscription, if push was turned on here. */
export async function pushSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  return (await (await navigator.serviceWorker.getRegistration("/sw.js"))?.pushManager.getSubscription()) ?? null;
}

/**
 * «حسابي» · M-14 (51): turn push notifications on for this phone / computer. Each device is turned on by itself;
 * the events and channels come from «قواعد الإشعارات».
 */
export function PushCard() {
  const run = useAction();
  const key = useQuery({ queryKey: ["push-key"], queryFn: () => api.get<{ publicKey: string | null }>("/notifications/push/key"), staleTime: Infinity });
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!supported()) return setState("unsupported");
    if (!key.data) return;
    if (!key.data.publicKey) return setState("off-server");
    if (Notification.permission === "denied") return setState("blocked");
    void navigator.serviceWorker.register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"));
  }, [key.data]);

  const turnOn = () => run(async () => {
    if ((await Notification.requestPermission()) !== "granted") { setState("blocked"); throw new Error("المتصفح رفض الإشعارات · اسمح بيها من إعدادات الموقع"); }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.data!.publicKey!) });
    await api.post("/notifications/push/subscriptions", sub.toJSON());
    setState("on");
  }, "الإشعارات اتفعّلت على الجهاز ده");

  const turnOff = () => run(async () => {
    const sub = await pushSubscription();
    if (sub) {
      await api.del("/notifications/push/subscriptions", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setState("off");
  }, "الإشعارات اتقفلت على الجهاز ده");

  const test = () => run(async () => {
    const r = await api.post<{ devices: number; sent: number }>("/notifications/push/test");
    if (!r.sent) throw new Error("الإشعار ماوصلش · جرّب تقفلها وتفعّلها تاني");
  }, "اتبعت · هيظهر على الجهاز خلال ثواني");

  return (
    <Card title="إشعارات الموبايل (Push)" icon="bell" sub="الإشعارات بتوصلك على الموبايل أو الكمبيوتر حتى لو السيستم مقفول">
      {state === "unsupported" && <Note kind="warn">المتصفح ده مابيدعمش الإشعارات · على الآيفون ضيف السيستم للشاشة الرئيسية الأول (Add to Home Screen).</Note>}
      {state === "off-server" && <Note>الـ Push لسه مش متفعّل على السيرفر.</Note>}
      {state === "blocked" && <Note kind="warn">الإشعارات مقفولة للموقع ده من إعدادات المتصفح · افتحها وارجع هنا.</Note>}
      {state === "off" && <button className="btn" onClick={() => void turnOn()}>فعّل الإشعارات على الجهاز ده</button>}
      {state === "on" && (
        <div className="row">
          <button className="btn ghost sm" onClick={() => void test()}>ابعت إشعار تجربة</button>
          <button className="btn ghost sm" onClick={() => void turnOff()}>وقّفها على الجهاز ده</button>
        </div>
      )}
    </Card>
  );
}
