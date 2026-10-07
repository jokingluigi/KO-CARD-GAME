import React from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import { AdminRewardsManager } from "../src/components/admin-rewards-manager";
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-black p-3 text-white">
    <AdminRewardsManager
      onUnauthorized={() => {
        throw new Error("Unauthorized QA");
      }}
    />
  </main>,
);
