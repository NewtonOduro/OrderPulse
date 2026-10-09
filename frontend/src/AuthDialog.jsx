import { useState } from "react";
import { AtSign, Eye, EyeOff, LockKeyhole, Phone, UserRound, X } from "lucide-react";

function AuthDialog({ mode, token, onClose, onSuccess, onModeChange, onClearAuthToken }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";
  const verifying = mode === "verify";
  const resetting = mode === "reset";
  const emailAction = mode === "forgot" || mode === "resend";
  const signingIn = mode === "login";

  async function post(path, body) {
    const response = await fetch(`/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      const requestError = new Error(result.error || "We couldn't complete that request.");
      requestError.code = result.code || "";
      throw requestError;
    }
    return result;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setErrorCode("");
    setStatus("");
    setBusy(true);
    try {
      if (verifying) {
        const result = await post("verify-email", { token });
        setEmail(result.email);
        setStatus(result.message);
        onClearAuthToken();
        onModeChange("login");
        return;
      }
      if (resetting) {
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        const result = await post("reset-password", { token, password });
        setEmail(result.email);
        setPassword("");
        setConfirmPassword("");
        setStatus(result.message);
        onClearAuthToken();
        onModeChange("login");
        return;
      }
      if (emailAction) {
        const endpoint = mode === "forgot" ? "forgot-password" : "resend-verification";
        const result = await post(endpoint, { email });
        setStatus(result.message);
        return;
      }
      if (registering) {
        const result = await post("register", { name, email, phone, password });
        setPassword("");
        setStatus(`${result.message} ${result.verificationEmail.message}`);
        onModeChange("resend");
        return;
      }

      const result = await post("login", { email, password });
      if (result.user.role !== "customer") {
        throw new Error("Use the staff sign-in to access restaurant operations.");
      }
      onSuccess(result.user);
    } catch (requestError) {
      setError(requestError.message);
      setErrorCode(requestError.code || "");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setError("");
    setErrorCode("");
    setStatus("");
    setPassword("");
    onModeChange(nextMode);
  }

  const title = registering
    ? "Join us at the table."
    : verifying
      ? "Verify your email."
      : resetting
        ? "Choose a new password."
        : mode === "forgot"
          ? "Reset your password."
          : mode === "resend"
            ? "Verify your account."
            : "Welcome back.";
  const description = registering
    ? "Create an account to request and keep track of your table reservations."
    : verifying
      ? "Confirm your email address to activate your OrderPulse account."
      : resetting
        ? "Choose a new password for your OrderPulse account."
        : mode === "forgot"
          ? "Enter your account email and we'll send a password reset link if it matches an active account."
          : mode === "resend"
            ? "Enter your account email to request a fresh verification link."
            : "Sign in to request a reservation and manage your upcoming visits.";

  return (
    <div className="auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-card" aria-labelledby="auth-heading">
        <button className="auth-close" onClick={onClose} aria-label="Close sign in"><X size={19} /></button>
        <span className="auth-mark"><UserRound size={22} /></span>
        <span className="auth-eyebrow">ORDERPULSE · ACCOUNT</span>
        <h2 id="auth-heading">{title}</h2>
        <p className="auth-description">{description}</p>
        <form className="auth-form" onSubmit={submit}>
          {registering && <>
            <label className="auth-label">Full name<span className="auth-input-row"><UserRound size={17} /><input aria-label="Full name" autoComplete="name" minLength="2" maxLength="80" onChange={(event) => setName(event.target.value)} placeholder="Ama Mensah" required value={name} /></span></label>
            <label className="auth-label">Phone number<span className="auth-input-row"><Phone size={17} /><input aria-label="Phone number" autoComplete="tel" minLength="7" maxLength="30" onChange={(event) => setPhone(event.target.value)} placeholder="+233 24 000 0000" required type="tel" value={phone} /></span></label>
          </>}
          {!verifying && !resetting && <label className="auth-label">Email address<span className="auth-input-row"><AtSign size={17} /><input aria-label="Email address" autoComplete="email" maxLength="254" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} /></span></label>}
          {(signingIn || registering || resetting) && <label className="auth-label">{resetting ? "New password" : "Password"}<span className="auth-input-row"><LockKeyhole size={17} /><input aria-label={resetting ? "New password" : "Password"} autoComplete={registering || resetting ? "new-password" : "current-password"} maxLength="128" minLength={registering || resetting ? 12 : 1} onChange={(event) => setPassword(event.target.value)} placeholder={registering || resetting ? "At least 12 characters" : "Enter your password"} required type={showPassword ? "text" : "password"} value={password} /><button className="password-visibility-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
          {resetting && <label className="auth-label">Confirm new password<span className="auth-input-row"><LockKeyhole size={17} /><input aria-label="Confirm new password" autoComplete="new-password" maxLength="128" minLength="12" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the same password again" required type={showPassword ? "text" : "password"} value={confirmPassword} /></span></label>}
          {error && <p role="alert" className="auth-error">{error}</p>}
          {status && <p role="status" className="auth-success">{status}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? "One moment…" : verifying ? "Verify email" : resetting ? "Save new password" : mode === "forgot" ? "Send reset link" : mode === "resend" ? "Send verification link" : registering ? "Create guest account" : "Sign in"}</button>
        </form>
        {signingIn && <p className="auth-switch"><button onClick={() => changeMode("forgot")}>Forgot password?</button></p>}
        {errorCode === "EMAIL_NOT_VERIFIED" && <p className="auth-switch"><button onClick={() => changeMode("resend")}>Resend verification email</button></p>}
        {(mode === "forgot" || mode === "resend") && <p className="auth-switch"><button onClick={() => changeMode("login")}>Back to sign in</button></p>}
        {(registering || mode === "resend") && <p className="auth-switch">{registering ? "Already have an account?" : "Already verified?"}{" "}<button onClick={() => changeMode("login")}>Sign in</button></p>}
        {signingIn && <p className="auth-switch">New to OrderPulse?{" "}<button onClick={() => changeMode("register")}>Create an account</button></p>}
        <p className="auth-footnote">Your email is used to verify account ownership and recover access.</p>
      </section>
    </div>
  );
}

export default AuthDialog;
