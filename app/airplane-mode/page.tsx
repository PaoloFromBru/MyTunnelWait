import type { Metadata } from "next";
import Footer from "@/components/Footer";
import AirplaneModeAssistant from "@/components/AirplaneModeAssistant";

export const metadata: Metadata = {
  title: "Promemoria modalità aereo",
  description: "Ricevi un promemoria per attivare manualmente la modalità aereo quando ti avvicini al confine svizzero.",
};

export default function AirplaneModePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="container-p flex-1 space-y-6 py-6">
        <header className="space-y-2">
          <h2 className="text-lg font-semibold">Modalità aereo vicino al confine svizzero</h2>
          <p className="text-sm text-gray-600">
            Per motivi di sicurezza le app web non possono attivare direttamente la modalità aereo del telefono. Con questo
            strumento puoi però ricevere un promemoria quando ti avvicini a un valico verso la Svizzera e decidere quando
            disattivare la rete cellulare.
          </p>
        </header>

        <AirplaneModeAssistant />

        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
          <h3 className="text-base font-semibold text-gray-900">Come attivare rapidamente la modalità aereo</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium text-gray-900">iOS:</span> apri il Centro di Controllo (swipe dall'angolo in alto a
              destra su iPhone con Face ID, oppure dal basso con tasto Home) e tocca l'icona dell'aereo.
            </li>
            <li>
              <span className="font-medium text-gray-900">Android:</span> scorri due volte verso il basso dalla parte superiore
              dello schermo per aprire i toggle rapidi e premi l'icona dell'aereo.
            </li>
          </ul>
          <p className="text-xs text-gray-500">
            Ricorda di riattivare la connettività quando rientri in Italia: potrai tornare ai servizi online e aggiornare i dati
            dell'app.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
