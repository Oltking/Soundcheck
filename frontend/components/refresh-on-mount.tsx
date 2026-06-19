"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Next's client Router Cache can serve a stale server-rendered page when you
// navigate back to it (e.g. the Runs list after finishing a run). Calling
// router.refresh() on mount re-fetches this route's server data so a just-
// finished run shows up without a full reload / re-login.
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
