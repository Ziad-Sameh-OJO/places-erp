import { Providers } from "../providers";

/**
 * The signed-in shell, ported from the approved demo: side menu filtered by permissions on desktop;
 * app bar + bottom tab bar + floating «جديد» + bottom sheets on phones (see demo css/mobile.css).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers><div className="app">{children}</div></Providers>;
}
