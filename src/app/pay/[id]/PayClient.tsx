"use client";

import { Suspense } from "react";
import MockPayInner from "./MockPayInner";

export default function PayClient() {
  return (
    <Suspense
      fallback={
        <div className="ba-atmosphere flex min-h-[100dvh] items-center justify-center text-mist-200">
          Loading checkout…
        </div>
      }
    >
      <MockPayInner />
    </Suspense>
  );
}
