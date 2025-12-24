import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import QuickInput from "./components/QuickInput";
import Settings from "./components/Settings";
import "./App.css";

type WindowKind = "quick" | "settings";

function App() {
  const [windowKind, setWindowKind] = useState<WindowKind>("settings");

  useEffect(() => {
    try {
      const win = getCurrentWindow();
      const label = win.label;
      if (label === "quick") {
        setWindowKind("quick");
      } else {
        setWindowKind("settings");
      }
    } catch (_) {
      setWindowKind("settings");
    }
  }, []);

  if (windowKind === "quick") {
    return <QuickInput />;
  }

  return <Settings />;
}

export default App;
