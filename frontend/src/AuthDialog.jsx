import { useState } from "react";
import { AtSign, Eye, EyeOff, LockKeyhole, Phone, UserRound, X } from "lucide-react";

function AuthDialog({ mode, onClose, onSuccess, onModeChange }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${registering ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(registering ? { name, email, phone, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't sign you in.");
      if (result.user.role !== "customer") throw new Error("Use the staff sign-in to access restaurant operations.");
      onSuccess(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setError("");
    setPassword("");
    onModeChange(nextMode);
  }

  return (
    <div className="auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-card" aria-labelledby="auth-heading">
        <button className="auth-close" onClick={onClose} aria-label="Close sign in"><X size={19} /></button>
        <span className="auth-mark"><UserRound size={22} /></span>
        <span className="auth-eyebrow">THE GREEN PLATE · GUESTS</span>
        <h2 id="auth-heading">{registering ? "Join us at the table." : "Welcome back."}</h2>
        <p className="auth-description">{registering ? "Create an account to request and keep track of your table reservations." : "Sign in to request a reservation and manage your upcoming visits."}</p>
        <form className="auth-form" onSubmit={submit}>
          {registering && <>
            <label className="auth-label">Full name<span className="auth-input-row"><UserRound size={17} /><input aria-label="Full name" autoComplete="name" minLength="2" maxLength="80" onChange={(event) => setName(event.target.value)} placeholder="Ama Mensah" required value={name} /></span></label>
            <label className="auth-label">Phone number<span className="auth-input-row"><Phone size={17} /><input aria-label="Phone number" autoComplete="tel" minLength="7" maxLength="30" onChange={(event) => setPhone(event.target.value)} placeholder="+233 24 000 0000" required type="tel" value={phone} /></span></label>
          </>}
          <label className="auth-label">Email address<span className="auth-input-row"><AtSign size={17} /><input aria-label="Email address" autoComplete="email" maxLength="254" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} /></span></label>
          <label className="auth-label">Password<span className="auth-input-row"><LockKeyhole size={17} /><input aria-label="Password" autoComplete={registering ? "new-password" : "current-password"} maxLength="128" minLength={registering ? 12 : 1} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? "At least 12 characters" : "Enter your password"} required type={showPassword ? "text" : "password"} value={password} /><button className="password-visibility-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          {error && <p role="alert" className="auth-error">{error}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? "One moment…" : registering ? "Create guest account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{registering ? "Already have an account?" : "New to OrderPulse?"}{" "}<button onClick={() => changeMode(registering ? "login" : "register")}>{registering ? "Sign in" : "Create an account"}</button></p>
        <p className="auth-footnote">Your account lets you manage your restaurant reservations.</p>
      </section>
    </div>
  );
}

export default AuthDialog;
