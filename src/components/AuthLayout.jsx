export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <main className="auth">
      <div className="auth-wrap">
        <div className="brand">Night Roll</div>
        <section className="auth-card">
          <h1>{title}</h1>
          <p className="sub">{subtitle}</p>
          {children}
        </section>
        <p className="auth-foot">{footer}</p>
      </div>
    </main>
  );
}
