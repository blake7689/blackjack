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

  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      await login({ usernameOrEmail: form.usernameOrEmail, password: form.password });
      nav("/");
    } catch (err) {
      alert(err.message || "Login failed");
    } finally { setLoading(false); }
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    setLoading(true);
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
      alert(err.message || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
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
            <button type="submit" disabled={loading}>Log in</button>
          </form>
        ) : (
          <form onSubmit={handleSignup} style={{ display:"grid", gap:10 }}>
            <input name="userName" placeholder="Username" value={form.userName} onChange={onChange} required />
            <input name="email" placeholder="Email" value={form.email} onChange={onChange} required />
            <input type="password" name="password" placeholder="Password" value={form.password} onChange={onChange} required />
            <input name="firstName" placeholder="First name" value={form.firstName} onChange={onChange} />
            <input name="lastName" placeholder="Last name" value={form.lastName} onChange={onChange} />
            <input type="number" name="credits" placeholder="Starting credits" value={form.credits} onChange={onChange} />
            <button type="submit" disabled={loading}>Create & sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}