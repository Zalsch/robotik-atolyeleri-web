"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
