import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import TireWear from "./TireWear.jsx";
import SignIn from "./SignIn.jsx";
import { C, FB } from "./theme.js";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking)
    return (
      <div style={{ fontFamily: FB, background: C.paper, minHeight: "100vh",
        padding: 40, color: C.muted }}>
        Checking your sign-in…
      </div>
    );

  if (!session) return <SignIn />;

  return <TireWear session={session} />;
}
