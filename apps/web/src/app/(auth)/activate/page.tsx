import { Suspense } from "react";
import { PasswordPage } from "../password-page";

export default function ActivatePage() {
  return <Suspense><PasswordPage kind="activate" /></Suspense>;
}
