"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "idle" | "pending" | "active" | "denied" | "unsupported" | "error";

type BorderPoint = {
  name: string;
  latitude: number;
  longitude: number;
};

const SWISS_ENTRY_POINTS: BorderPoint[] = [
  { name: "Chiasso - Brogeda (A9)", latitude: 45.8336, longitude: 9.0316 },
  { name: "Stabio - Gaggiolo", latitude: 45.8524, longitude: 8.9379 },
  { name: "Ponte Tresa", latitude: 45.9679, longitude: 8.8582 },
  { name: "Valico del Sempione", latitude: 46.2214, longitude: 8.0582 },
  { name: "Gran San Bernardo", latitude: 45.9452, longitude: 7.1993 },
  { name: "Forcola di Livigno", latitude: 46.4502, longitude: 10.0871 },
];

const NEAR_DISTANCE_METERS = 5000;

const STATUS_LABEL: Record<Status, string> = {
  idle: "Monitoraggio inattivo",
  pending: "Richiesta del permesso in corso...",
  active: "Monitoraggio attivo",
  denied: "Permesso negato",
  unsupported: "Geolocalizzazione non supportata",
  error: "Errore durante il monitoraggio",
};

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // raggio terrestre medio in metri
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function AirplaneModeAssistant() {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState(true);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "geolocation" in navigator;
    setSupported(ok);
    if (!ok) setStatus("unsupported");
  }, []);

  useEffect(() => {
    return () => {
      if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  const startTracking = () => {
    if (!supported || typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setErrorMessage("Il dispositivo non espone le API di geolocalizzazione.");
      return;
    }

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    setErrorMessage(null);
    setStatus("pending");
    const newWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(pos);
        setStatus("active");
        setErrorMessage(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setErrorMessage("Permesso di geolocalizzazione negato. Concedilo dalle impostazioni del browser.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus("error");
          setErrorMessage("Posizione attualmente non disponibile. Riprova tra qualche istante.");
        } else {
          setStatus("error");
          setErrorMessage(err.message || "Impossibile ottenere la posizione.");
        }
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.clearWatch(newWatchId);
        }
        setWatchId(null);
        setPosition(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 15_000,
      },
    );

    setWatchId(newWatchId);
  };

  const stopTracking = () => {
    if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    setWatchId(null);
    setStatus("idle");
    setPosition(null);
    setErrorMessage(null);
  };

  const locationInfo = useMemo(() => {
    if (!position) return null;
    const { latitude, longitude } = position.coords;
    const distances = SWISS_ENTRY_POINTS.map((point) => ({
      ...point,
      distance: distanceMeters(latitude, longitude, point.latitude, point.longitude),
    }));
    distances.sort((a, b) => a.distance - b.distance);
    return distances[0];
  }, [position]);

  const isNear = locationInfo ? locationInfo.distance <= NEAR_DISTANCE_METERS : false;
  const distanceKm = locationInfo ? locationInfo.distance / 1000 : null;
  const lastUpdate = position ? new Date(position.timestamp) : null;
  const isTracking = watchId !== null;

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={isTracking ? stopTracking : startTracking}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={status === "pending"}
          >
            {isTracking ? "Ferma monitoraggio" : "Attiva promemoria"}
          </button>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Il browser non può attivare la modalità aereo al posto tuo, ma può avvisarti quando ti avvicini a uno dei valichi
          sorvegliati entro circa 5 km.
        </p>
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      </div>

      {lastUpdate && locationInfo && (
        <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">Ultimo aggiornamento: {lastUpdate.toLocaleString()}</div>
          <div className="mt-1">Coordinate rilevate: {position!.coords.latitude.toFixed(4)}, {position!.coords.longitude.toFixed(4)}</div>
          <div className="mt-1">
            Valico più vicino: <span className="font-medium text-gray-900">{locationInfo.name}</span>
            {distanceKm !== null && (
              <span> — circa {distanceKm < 1 ? `${Math.round(locationInfo.distance)} metri` : `${distanceKm.toFixed(2)} km`}</span>
            )}
          </div>
        </div>
      )}

      {isTracking && (
        <div
          className={`rounded-xl border p-4 text-sm transition ${
            isNear
              ? "border-indigo-300 bg-indigo-50 text-indigo-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {isNear ? (
            <>
              <div className="text-base font-semibold">Sei vicino alla Svizzera 🇨🇭</div>
              <p className="mt-1">
                Ti trovi entro pochi chilometri dal valico {locationInfo?.name}. Per evitare costi di roaming, attiva ora
                manualmente la modalità aereo sul tuo telefono.
              </p>
            </>
          ) : (
            <>
              <div className="text-base font-semibold">Non sei ancora al confine</div>
              <p className="mt-1">
                Continueremo a monitorare la posizione in background. Ti mostreremo qui il promemoria quando sarai abbastanza
                vicino a uno dei valichi sorvegliati.
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Valichi monitorati</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
          {SWISS_ENTRY_POINTS.map((point) => (
            <li key={point.name}>{point.name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
