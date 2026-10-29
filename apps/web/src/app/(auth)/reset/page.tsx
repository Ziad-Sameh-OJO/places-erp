import { Suspense } from "react";
import { PasswordPage } from "../password-page";

export default function ResetPage() {
  return <Suspense><PasswordPage kind="reset" /></Suspense>;
}
