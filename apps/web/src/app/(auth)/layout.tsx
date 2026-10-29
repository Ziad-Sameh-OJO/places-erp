/** Signed-out pages, in the demo's sign-in card. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M8 25V7h9a6 6 0 0 1 0 12h-9" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="24" cy="24" r="2.6" fill="currentColor" /></svg></span>
          <div><strong>Places ERP</strong><small>BY RECA TECH</small></div>
        </div>
        {children}
      </div>
    </div>
  );
}
