"use client";

import { useEffect, useState } from "react";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem("theme", next);
      } catch {}
    }
  };

  return (
    <button className="button" title={theme === "dark" ? "Switch to light" : "Switch to dark"} aria-label="Toggle color theme" onClick={toggle}>
      <span aria-hidden>{theme === "dark" ? "🌙" : "🌞"}</span>
      <span style={{ fontSize: 13 }}>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
