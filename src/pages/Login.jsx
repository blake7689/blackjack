import "./pages.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";

export default function Login() {
  const { login, addPlayer } = usePlayer();
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({
    usernameOrEmail: "", password: "",
    userName: "", email: "", firstName: "", lastName: "", credits: 1000
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");   // << add

  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const startStatusTimers = () => {
    setStatusMsg("Contacting server...");
    const tip1 = setTimeout(() => {
      setStatusMsg("Server may be waking up… this can take ~30s.");
    }, 5000);
    const tip2 = setTimeout(() => {
      setStatusMsg("Still waiting… the server is booting up. Please wait or try again in a minute.");
    }, 30000);
    return [tip1, tip2];
  };

  const clearTimers = (timers) => timers.forEach(t => clearTimeout(t));

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoading(true);
    const timers = startStatusTimers();
    try {
      await login({ usernameOrEmail: form.usernameOrEmail, password: form.password });
      nav("/");
    } catch (err) {
      // Network/timeout style errors usually mean no response from server
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
        setStatusMsg("No response from server. It may be paused; try again in a minute.");
      } else {
        setStatusMsg(err?.message || "Login failed");
      }
      alert(statusMsg || "Login failed");
    } finally {
      clearTimers(timers);
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    setLoading(true);
    const timers = startStatusTimers();
    try {
      await addPlayer({
        userName: form.userName,
        password: form.password,
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        credits: Number(form.credits)
      });
      nav("/");
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
        setStatusMsg("No response from server. It may be paused; try again in a minute.");
      } else {
        setStatusMsg(err?.message || "Signup failed");
      }
      alert(statusMsg || "Signup failed");
    } finally {
      clearTimers(timers);
      setLoading(false);
    }
  };

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
              {loading && <div style={{ marginTop: 8, opacity: 0.9, fontSize: 14 }}>
                <span className="spinner" /> {statusMsg}
              </div>}
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
              {loading && <div style={{ marginTop: 8, opacity: 0.9, fontSize: 14 }}>
                <span className="spinner" /> {statusMsg}
              </div>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}