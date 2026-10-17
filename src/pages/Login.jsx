import "./pages.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";

const NETWORK_ERROR = /failed to fetch|network|timeout/i;

export default function Login() {
  const { login, addPlayer } = usePlayer();
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({
    usernameOrEmail: "", password: "",
    userName: "", email: "", firstName: "", lastName: "", credits: ""
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  // The free-tier API can take ~30s to wake, so keep the player informed while waiting.
  const submit = async (e, work, failure) => {
    e.preventDefault();
    setLoading(true);
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
      alert(msg);
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
    }
  };

  const handleLogin = (e) => submit(e, () => login({ usernameOrEmail: form.usernameOrEmail, password: form.password }), "Login failed");

  const handleSignup = (e) => submit(e, () => addPlayer({
    userName: form.userName,
    password: form.password,
    email: form.email,
    firstName: form.firstName,
    lastName: form.lastName,
    credits: Number(form.credits)
  }), "Signup failed");

  const status = loading && (
    <div style={{ marginTop: 8, opacity: 0.9, fontSize: 14 }}>
      <span className="spinner" /> {statusMsg}
    </div>
  );

  return (
    <div className="page-bg">
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", color: "#fff" }}>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <button onClick={() => setTab("login")} style={{ padding:8, borderRadius:8, background: tab==="login" ? "#2e7bff":"#2b3a44", color:"#fff", border:"none" }}>Login</button>
            <button onClick={() => setTab("signup")} style={{ padding:8, borderRadius:8, background: tab==="signup" ? "#2e7bff":"#2b3a44", color:"#fff", border:"none" }}>Add player</button>
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} style={{ display:"grid", gap:10 }}>
              <input name="usernameOrEmail" placeholder="Username or Email" value={form.usernameOrEmail} onChange={onChange} />
              <input type="password" name="password" placeholder="Password" value={form.password} onChange={onChange} />
              <button type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Logging in…</> : "Log in"}
              </button>
              {status}
            </form>
          ) : (
            <form onSubmit={handleSignup} style={{ display:"grid", gap:10 }}>
              <input name="userName" placeholder="Username" value={form.userName} onChange={onChange} required />
              <input name="email" placeholder="Email" value={form.email} onChange={onChange} required />
              <input type="password" name="password" placeholder="Password" value={form.password} onChange={onChange} required />
              <input name="firstName" placeholder="First name" value={form.firstName} onChange={onChange} />
              <input name="lastName" placeholder="Last name" value={form.lastName} onChange={onChange} />
              <input type="number" name="credits" placeholder="Starting credits" value={form.credits} onChange={onChange} />
              <button type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Creating…</> : "Create & sign in"}
              </button>
              {status}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
