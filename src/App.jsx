import { Routes, Route } from "react-router-dom";
import Sprite from "./components/Sprite/Sprite";
import Header from "./components/Header/Header";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Game from "./pages/Game"
import "./App.css";

export default function App() {
  return (
    <div className="app-root">
      <Sprite />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game" element={<Game />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </div>
  );
}