import "./pages.css";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { validateField } from "../utils/validation";
import Wordmark from "../components/Wordmark/Wordmark";
import { Page } from "../components/PageScreens/PageScreens";

const NETWORK_ERROR = /failed to fetch|network|timeout/i;

const SIGNUP_FIELDS = [
  { name: "userName", label: "Username", autoComplete: "username" },
  { name: "email", label: "Email", autoComplete: "email" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
  { name: "firstName", label: "First name", autoComplete: "given-name" },
  { name: "lastName", label: "Last name", autoComplete: "family-name" },
];

// Same rules as Settings; unlike Settings, a new account must choose a password.
const signupError = (name, value) => (name === "password" && !value ? "Password is required." : validateField(name, value));

// Log in (/login) and Create an account (/signup): two screens, one component (DESIGN section 8). //
export default function Login({ signup: creating = false }) {
  const { player, login, addPlayer, notice } = usePlayer();
  const nav = useNavigate();
  const [form, setForm] = useState({
    usernameOrEmail: "", password: "",
    userName: "", email: "", firstName: "", lastName: ""
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState(null);
  // Signup fields show their error once the player has typed in or left them.
  const [touched, setTouched] = useState({});

  const onChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setTouched({ ...touched, [e.target.name]: true });
  };
  const onBlur = e => setTouched({ ...touched, [e.target.name]: true });

  const signupErrors = Object.fromEntries(SIGNUP_FIELDS.map(({ name }) => [name, signupError(name, form[name])]));
  const signupInvalid = Object.values(signupErrors).some(Boolean);

  // The free-tier API can take ~30s to wake, so keep the player informed while waiting.
  const submit = async (e, work, failure) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMsg("Contacting server...");
    const timers = [
      setTimeout(() => setStatusMsg("Waking up the table. The first log-in can take up to 30 seconds."), 5000),
      setTimeout(() => setStatusMsg("Still waking up the table. Please wait or try again in a minute."), 30000),
    ];
    try {
      await work();
      nav("/");
    } catch (err) {
      const msg = NETWORK_ERROR.test(err.message)
        ? "No response from server. It may be paused; try again in a minute."
        : err.message || failure;
      setStatusMsg(msg);
      setError(msg);
      setLoading(false); // not after success: the page is going home, and a signed-in Login that is not loading redirects away
    } finally {
      timers.forEach(clearTimeout);
    }
  };

  const handleLogin = (e) => submit(e, () => login({ usernameOrEmail: form.usernameOrEmail, password: form.password }), "Login failed");

  const handleSignup = (e) => {
    if (signupInvalid) {
      // Enter in a field still submits the form; show every problem instead.
      e.preventDefault();
      setTouched(Object.fromEntries(SIGNUP_FIELDS.map(({ name }) => [name, true])));
      return;
    }
    return signup(e);
  };

  const signup = (e) => submit(e, () => addPlayer({
    userName: form.userName,
    password: form.password,
    email: form.email,
    firstName: form.firstName,
    lastName: form.lastName
  }), "Signup failed");


  // Already signed in (a bookmark, the back button): nothing to do here. Not while this form's own submit is in flight, which goes home itself.
  if (player && !loading) return <Navigate to="/game" replace />;

  return (
    <Page>
      <Wordmark className="wm" />
      <h1>{creating ? "Create an account" : "Log in"}</h1>
      {notice && <p className="alert" role="alert">{notice}</p>}
      {loading && <div className="waking" role="status"><span className="spin" aria-hidden="true" /><span>{statusMsg}</span></div>}
      {error && <p className="alert" role="alert">{error}</p>}
      {creating ? (
        <form onSubmit={handleSignup} className="form" noValidate>
          {SIGNUP_FIELDS.map(({ name, label, type, autoComplete }) => {
            const message = touched[name] && signupErrors[name];
            return (
              <div key={name}>
                <label>{label}
                  <input name={name} type={type} placeholder={label} autoComplete={autoComplete} value={form[name]} onChange={onChange} onBlur={onBlur}
                    aria-invalid={Boolean(message)} aria-describedby={message ? `su-${name}` : undefined} />
                </label>
                {message && <span className="ferr" id={`su-${name}`}>{message}</span>}
              </div>
            );
          })}
          <button type="submit" className="btn primary" disabled={loading || signupInvalid}>{loading ? "Creating account..." : "Create account"}</button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="form" noValidate>
          <label>Username or email
            <input name="usernameOrEmail" placeholder="Username or Email" autoComplete="username" value={form.usernameOrEmail} onChange={onChange} aria-invalid={Boolean(error)} />
          </label>
          <label>Password
            <input type="password" name="password" placeholder="Password" autoComplete="current-password" value={form.password} onChange={onChange} aria-invalid={Boolean(error)} />
          </label>
          <button type="submit" className="btn primary" disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
        </form>
      )}
      <p className="signed">{creating ? <>Have an account? <Link to="/login">Log in</Link></> : <Link to="/signup">Create an account</Link>}</p>
    </Page>
  );
}
