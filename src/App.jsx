import React, { useState } from "react";
import AppShell from "./AppShell.jsx";
import Identify from "./Identify.jsx";
import { readWho, clearWho } from "./identity.js";

export default function App() {
  const [who, setWho] = useState(readWho);

  if (!who) return <Identify onDone={setWho} />;

  return (
    <AppShell
      who={who}
      onSwitchUser={() => {
        clearWho();
        setWho(null);
      }}
    />
  );
}
