"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Note, useAction } from "@/components/ui";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("notifications.push");
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
    if ((await Notification.requestPermission()) !== "granted") { setState("blocked"); throw new Error(t("denied")); }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.data!.publicKey!) });
    await api.post("/notifications/push/subscriptions", sub.toJSON());
    setState("on");
  }, t("turnedOn"));

  const turnOff = () => run(async () => {
    const sub = await pushSubscription();
    if (sub) {
      await api.del("/notifications/push/subscriptions", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setState("off");
  }, t("turnedOff"));

  const test = () => run(async () => {
    const r = await api.post<{ devices: number; sent: number }>("/notifications/push/test");
    if (!r.sent) throw new Error(t("testFailed"));
  }, t("testSent"));

  return (
    <Card title={t("title")} icon="bell" sub={t("sub")}>
      {state === "unsupported" && <Note kind="warn">{t("unsupported")}</Note>}
      {state === "off-server" && <Note>{t("offServer")}</Note>}
      {state === "blocked" && <Note kind="warn">{t("blocked")}</Note>}
      {state === "off" && <button className="btn" onClick={() => void turnOn()}>{t("turnOn")}</button>}
      {state === "on" && (
        <div className="row">
          <button className="btn ghost sm" onClick={() => void test()}>{t("test")}</button>
          <button className="btn ghost sm" onClick={() => void turnOff()}>{t("turnOff")}</button>
        </div>
      )}
    </Card>
  );
}
