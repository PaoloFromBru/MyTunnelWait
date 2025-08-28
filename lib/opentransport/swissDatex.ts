// lib/opentransport/swissDatex.ts
import "server-only";
import { XMLParser } from "fast-xml-parser";

export type DatexSituation = Record<string, any>;

export interface PullOptions {
  ifModifiedSince?: string;
  soapAction?: string;
}

const ENDPOINT =
  "https://api.opentransportdata.swiss/TDP/Soap_Datex2/TrafficSituations/Pull";
const SOAP_ACTION_DEFAULT =
  "http://opentransportdata.swiss/TDP/Soap_Datex2/Pull/v1/pullTrafficMessages";

function buildEnvelope(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <d2LogicalModel xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                    modelBaseVersion="2"
                    xmlns="http://datex2.eu/schema/2/2_0">
      <exchange>
        <supplierIdentification>
          <country>ch</country>
          <nationalIdentifier>FEDRO</nationalIdentifier>
        </supplierIdentification>
        <subscription>
          <operatingMode>operatingMode1</operatingMode>
          <subscriptionStartTime>2025-05-01T08:00:00.00+01:00</subscriptionStartTime>
          <subscriptionState>active</subscriptionState>
          <updateMethod>singleElementUpdate</updateMethod>
          <target>
            <address></address>
            <protocol>http</protocol>
          </target>
        </subscription>
      </exchange>
    </d2LogicalModel>
  </soap:Body>
</soap:Envelope>`;
}

export async function fetchTrafficSituationsXML(opts: PullOptions = {}): Promise<string> {
  const token = process.env.OTD_SWISS_TOKEN;
  if (!token) throw new Error("Missing OTD_SWISS_TOKEN env");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: opts.soapAction ?? SOAP_ACTION_DEFAULT,
  };
  if (opts.ifModifiedSince) headers["If-Modified-Since"] = opts.ifModifiedSince;

  const res = await fetch(ENDPOINT, { method: "POST", headers, body: buildEnvelope(), cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SOAP HTTP ${res.status}: ${res.statusText}${txt ? ` - ${txt.slice(0, 500)}` : ""}`);
  }
  return res.text();
}

export function parseDatex(xml: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true,
  });
  return parser.parse(xml);
}

// --- helpers
function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    // DATEX: { "#text": "...", "type": "dx223:..." }
    if ("#text" in v && (typeof v["#text"] === "string" || typeof v["#text"] === "number" || typeof v["#text"] === "boolean")) {
      return String(v["#text"]);
    }
    if ("value" in v && (typeof (v as any).value === "string" || typeof (v as any).value === "number" || typeof (v as any).value === "boolean")) {
      return String((v as any).value);
    }
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}
const toArr = <T>(v: T | T[] | undefined | null): T[] => Array.isArray(v) ? v : v != null ? [v] : [];

// --- extraction
export function extractSituations(datexJS: any): {
  situations: Array<{
    id?: string;
    version?: string | number;
    probabilityOfOccurrence?: string;
    validityStatus?: string;
    severity?: string;
    firstComment?: string;
    roadNames?: string[];
    locationSummary?: string;
    raw: DatexSituation;
  }>;
  publicationTime?: string;
} {
  const root =
    datexJS?.Envelope?.Body?.d2LogicalModel ??
    datexJS?.Envelope?.Body?.D2LogicalModel ??
    datexJS?.Body?.d2LogicalModel ??
    datexJS?.d2LogicalModel ??
    datexJS;

  const pub = root?.payloadPublication ?? root?.PayloadPublication;
  const publicationTime = asText(pub?.publicationTime); // <-- NORMALIZZATO

  let rawSituations = pub?.situation ?? [];
  if (!Array.isArray(rawSituations)) rawSituations = rawSituations ? [rawSituations] : [];

  const situations = rawSituations.map((s: any) => {
    const id = s?.id;
    const version = s?.version;
    const header = s?.headerInformation ?? {};
    const probabilityOfOccurrence = asText(header?.probabilityOfOccurrence);
    const validityStatus = asText(header?.informationStatus ?? s?.overallSeverity);
    const severityRaw =
      s?.situationRecord?.severity ??
      header?.informationStatus ??
      s?.overallSeverity;

    const comments = [
      ...toArr(s?.generalPublicComment?.comment),
      ...toArr(s?.situationRecord?.generalPublicComment?.comment),
    ].map(asText).filter(Boolean);

    const roadNames = [
      ...toArr(s?.situationRecord?.groupOfLocations?.tpegLinearLocation?.name),
      ...toArr(s?.situationRecord?.groupOfLocations?.tpegNonLinearLocation?.name),
    ].map(asText).filter(Boolean);

    const locationSummary =
      asText(s?.situationRecord?.groupOfLocations?.tpegLinearLocation?.toString) ||
      roadNames[0] || undefined;

    return {
      id,
      version,
      probabilityOfOccurrence,
      validityStatus,
      severity: asText(severityRaw) || undefined, // <-- NORMALIZZATO
      firstComment: comments[0],
      roadNames: roadNames.length ? roadNames : undefined,
      locationSummary,
      raw: s,
    };
  });

  return { situations, publicationTime };
}

// --- filter
export function filterForGotthard(
  situations: Array<{ raw: any; firstComment?: string; roadNames?: string[]; locationSummary?: string }>
) {
  const KW = [
    "Gotthard","Gottardo","San Gottardo","Sankt Gotthard",
    "Galleria del San Gottardo","Tunnel du Gothard","Gotthardtunnel","A2"
  ];
  const hasKW = (txt: any) => {
    const s = asText(txt).toLowerCase();
    return s && KW.some(k => s.includes(k.toLowerCase()));
  };

  return situations.filter(s => {
    if (hasKW(s.firstComment)) return true;
    if (s.roadNames?.some(hasKW)) return true;
    if (hasKW(s.locationSummary)) return true;
    const rawSlice = asText(s.raw).slice(0, 4000);
    return hasKW(rawSlice);
  });
}
