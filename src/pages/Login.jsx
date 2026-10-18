import "./pages.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { validateField } from "../utils/validation";

const NETWORK_ERROR = /failed to fetch|network|timeout/i;

const SIGNUP_FIELDS = [
  { name: "userName", placeholder: "Username" },
  { name: "email", placeholder: "Email" },
  { name: "password", placeholder: "Password", type: "password" },
  { name: "firstName", placeholder: "First name" },
  { name: "lastName", placeholder: "Last name" },
];

// Same rules as Settings; unlike Settings, a new account must choose a password.
const signupError = (name, value) => (name === "password" && !value ? "Password is required." : validateField(name, value));

export default function Login() {
  const { login, addPlayer } = usePlayer();
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
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
      setTimeout(() => setStatusMsg("Server may be waking up… this can take ~30s."), 5000),
      setTimeout(() => setStatusMsg("Server is still waking up... Please wait or try again in a minute."), 30000),
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
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
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

  const status = loading && (
    <div className="load-status">
      <span className="spinner" /> {statusMsg}
    </div>
  );

  return (
    <div className="page-bg">
      <div className="page-body">
        <div className="login-panel">
          <div className="tabs">
            <button onClick={() => setTab("login")} className={`tab-btn${tab === "login" ? " active" : ""}`}>Login</button>
            <button onClick={() => setTab("signup")} className={`tab-btn${tab === "signup" ? " active" : ""}`}>Add player</button>
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="stack-form">
              <input name="usernameOrEmail" placeholder="Username or Email" value={form.usernameOrEmail} onChange={onChange} />
              <input type="password" name="password" placeholder="Password" value={form.password} onChange={onChange} />
              <button type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Logging in…</> : "Log in"}
              </button>
              {status}
              {error && <div role="alert" className="notice error">{error}</div>}
            </form>
          ) : (
            <form onSubmit={handleSignup} className="stack-form">
              {SIGNUP_FIELDS.map(({ name, placeholder, type }) => (
                <div key={name}>
                  <input name={name} type={type} placeholder={placeholder} value={form[name]} onChange={onChange} onBlur={onBlur}
                    aria-invalid={Boolean(touched[name] && signupErrors[name])} className="full-width" />
                  {touched[name] && signupErrors[name] && <div className="field-error">{signupErrors[name]}</div>}
                </div>
              ))}
              <button type="submit" disabled={loading || signupInvalid}>
                {loading ? <><span className="spinner" /> Creating…</> : "Create & sign in"}
              </button>
              {status}
              {error && <div role="alert" className="notice error">{error}</div>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
