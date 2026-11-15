import { LanguageSwitch } from "@/components/language-switch";

/**
 * Signed-out pages: the Places wordmark and its line on the brand black, the sign-in card under it; the language can
 * be picked before signing in.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-hero">
        <img className="auth-logo" src="/brand/places-logo-white.png" alt="Places" width={936} height={222} />
        <p>The Ideal Place to Start Your Story</p>
      </div>
      <div className="auth-card">
        <div className="auth-brand">
          <small className="auth-erp">Places ERP</small>
          <LanguageSwitch className="btn ghost sm lang-btn" />
        </div>
        {children}
      </div>
    </div>
  );
}
