"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Planner from "@/components/Planner";
import Link from "next/link";

export default function PlanPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container-p py-6 flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pianifica il viaggio (previsioni)</h2>
          <Link
            href="/"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← Torna alla lista
          </Link>
        </div>

        <Planner />
      </main>
      <Footer />
    </div>
  );
}
