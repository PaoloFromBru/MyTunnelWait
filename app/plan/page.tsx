"use client";

import Footer from "@/components/Footer";
import Planner from "@/components/Planner";

export default function PlanPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="container-p py-6 flex-1 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Pianifica il viaggio (previsioni)</h2>
        </div>

        <Planner />
      </main>
      <Footer />
    </div>
  );
}
