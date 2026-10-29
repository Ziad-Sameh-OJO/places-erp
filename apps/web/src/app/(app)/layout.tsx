import { Providers } from "../providers";
import { Shell } from "@/components/shell";

/** Every signed-in page: the demo's shell (side menu by permission, top bar, bell; tab bar on phones). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers><Shell>{children}</Shell></Providers>;
}
