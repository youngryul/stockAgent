import {
  KIS_DOMESTIC_BALANCE_PATH,
  KIS_DOMESTIC_TR_PAPER,
  KIS_DOMESTIC_TR_REAL,
  KIS_OVERSEAS_BALANCE_PATH,
  KIS_OVERSEAS_EXCHANGES,
  KIS_OVERSEAS_TR_PAPER,
  KIS_OVERSEAS_TR_REAL,
  KIS_PAPER_BASE_URL,
  KIS_REAL_BASE_URL,
  KIS_TOKEN_PATH,
} from "@/lib/constants";
import { krSymbolFromPdno, lookupUniverseName } from "@/lib/universe-names";

export type KisEnvironment = "real" | "paper";

export type KisCredentials = {
  appKey: string;
  appSecret: string;
  cano: string;
  accountProductCode: string;
  environment: KisEnvironment;
};

export type KisPosition = {
  symbol: string;
  market: "KR" | "US";
  name: string;
  quantity: number;
  avgCost: number;
};

export type KisHoldingsSnapshot = {
  cashAmount: number | null;
  krPositions: KisPosition[];
  usPositions: KisPosition[] | null;
};

type JsonMap = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 15000;
const MAX_PAGES = 20;

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function kisMessage(payload: JsonMap | null, fallback: string): string {
  const message = asText(payload?.msg1) || asText(payload?.msg_cd) || fallback;
  return message.slice(0, 300);
}

function baseUrl(environment: KisEnvironment): string {
  return environment === "paper" ? KIS_PAPER_BASE_URL : KIS_REAL_BASE_URL;
}

async function kisFetch(url: string, init: RequestInit): Promise<JsonMap> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let payload: JsonMap | null = null;
  try {
    payload = (await response.json()) as JsonMap;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(kisMessage(payload, `한국투자 API HTTP ${response.status}`));
  }
  return payload || {};
}

/**
 * Issue a short-lived KIS access token. Secrets are not persisted.
 */
export async function fetchKisAccessToken(credentials: KisCredentials): Promise<string> {
  const payload = await kisFetch(`${baseUrl(credentials.environment)}${KIS_TOKEN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: credentials.appKey,
      appsecret: credentials.appSecret,
    }),
  });
  const token = asText(payload.access_token);
  if (!token) {
    throw new Error(kisMessage(payload, "한국투자 토큰을 받지 못했습니다."));
  }
  return token;
}

function authHeaders(
  credentials: KisCredentials,
  token: string,
  trId: string,
  trCont?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    authorization: `Bearer ${token}`,
    appkey: credentials.appKey,
    appsecret: credentials.appSecret,
    tr_id: trId,
    custtype: "P",
  };
  if (trCont) {
    headers.tr_cont = trCont;
  }
  return headers;
}

async function fetchDomesticPage(
  credentials: KisCredentials,
  token: string,
  ctxFk: string,
  ctxNk: string,
  trCont?: string,
): Promise<{ rows: JsonMap[]; summary: JsonMap | null; nextFk: string; nextNk: string; hasMore: boolean }> {
  const trId =
    credentials.environment === "paper" ? KIS_DOMESTIC_TR_PAPER : KIS_DOMESTIC_TR_REAL;
  const params = new URLSearchParams({
    CANO: credentials.cano,
    ACNT_PRDT_CD: credentials.accountProductCode,
    AFHR_FLPR_YN: "N",
    OFL_YN: "",
    INQR_DVSN: "02",
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "00",
    CTX_AREA_FK100: ctxFk,
    CTX_AREA_NK100: ctxNk,
  });
  const payload = await kisFetch(
    `${baseUrl(credentials.environment)}${KIS_DOMESTIC_BALANCE_PATH}?${params.toString()}`,
    { method: "GET", headers: authHeaders(credentials, token, trId, trCont) },
  );
  if (asText(payload.rt_cd) !== "0") {
    throw new Error(kisMessage(payload, "국내 잔고 조회에 실패했습니다."));
  }
  const rows = Array.isArray(payload.output1) ? (payload.output1 as JsonMap[]) : [];
  const summaryRaw = payload.output2;
  const summary = Array.isArray(summaryRaw)
    ? ((summaryRaw[0] as JsonMap | undefined) ?? null)
    : summaryRaw && typeof summaryRaw === "object"
      ? (summaryRaw as JsonMap)
      : null;
  const nextFk = asText(payload.ctx_area_fk100);
  const nextNk = asText(payload.ctx_area_nk100);
  const cont = asText(payload.tr_cont).toUpperCase();
  return {
    rows,
    summary,
    nextFk,
    nextNk,
    hasMore: (cont === "M" || cont === "F") && Boolean(nextNk),
  };
}

async function fetchOverseasPage(
  credentials: KisCredentials,
  token: string,
  exchange: string,
  ctxFk: string,
  ctxNk: string,
): Promise<JsonMap[]> {
  const trId =
    credentials.environment === "paper" ? KIS_OVERSEAS_TR_PAPER : KIS_OVERSEAS_TR_REAL;
  const params = new URLSearchParams({
    CANO: credentials.cano,
    ACNT_PRDT_CD: credentials.accountProductCode,
    OVRS_EXCG_CD: exchange,
    TR_CRCY_CD: "USD",
    CTX_AREA_FK200: ctxFk,
    CTX_AREA_NK200: ctxNk,
  });
  const payload = await kisFetch(
    `${baseUrl(credentials.environment)}${KIS_OVERSEAS_BALANCE_PATH}?${params.toString()}`,
    { method: "GET", headers: authHeaders(credentials, token, trId) },
  );
  if (asText(payload.rt_cd) !== "0") {
    throw new Error(kisMessage(payload, "해외 잔고 조회에 실패했습니다."));
  }
  const output = payload.output1 ?? payload.output;
  return Array.isArray(output) ? (output as JsonMap[]) : [];
}

function toKrPosition(row: JsonMap): KisPosition | null {
  const quantity = asNumber(row.hldg_qty);
  if (quantity <= 0) {
    return null;
  }
  const pdno = asText(row.pdno);
  if (!pdno) {
    return null;
  }
  const symbol = krSymbolFromPdno(pdno);
  return {
    symbol,
    market: "KR",
    name: lookupUniverseName(symbol) || asText(row.prdt_name),
    quantity,
    avgCost: asNumber(row.pchs_avg_pric),
  };
}

function toUsPosition(row: JsonMap): KisPosition | null {
  const quantity = asNumber(row.ovrs_cblc_qty ?? row.hldg_qty);
  if (quantity <= 0) {
    return null;
  }
  const ticker = asText(row.ovrs_pdno || row.pdno).toUpperCase();
  if (!ticker) {
    return null;
  }
  return {
    symbol: ticker,
    market: "US",
    name: lookupUniverseName(ticker) || asText(row.ovrs_item_name || row.prdt_name),
    quantity,
    avgCost: asNumber(row.pchs_avg_pric || row.avg_unpr),
  };
}

function mergeBySymbol(positions: KisPosition[]): KisPosition[] {
  const merged = new Map<string, KisPosition>();
  for (const position of positions) {
    const current = merged.get(position.symbol);
    if (!current) {
      merged.set(position.symbol, position);
      continue;
    }
    const quantity = current.quantity + position.quantity;
    const cost = current.avgCost * current.quantity + position.avgCost * position.quantity;
    merged.set(position.symbol, {
      ...current,
      quantity,
      avgCost: quantity > 0 ? cost / quantity : current.avgCost,
      name: current.name || position.name,
    });
  }
  return [...merged.values()];
}

/**
 * Fetch KR (and US when available) holdings plus KRW cash. Keys are not stored.
 */
export async function fetchKisHoldings(credentials: KisCredentials): Promise<KisHoldingsSnapshot> {
  const token = await fetchKisAccessToken(credentials);
  const krRows: JsonMap[] = [];
  let cashAmount: number | null = null;
  let ctxFk = "";
  let ctxNk = "";
  let trCont: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchDomesticPage(credentials, token, ctxFk, ctxNk, trCont);
    krRows.push(...result.rows);
    if (result.summary) {
      cashAmount = asNumber(result.summary.dnca_tot_amt ?? result.summary.nxdy_excc_amt);
    }
    if (!result.hasMore) {
      break;
    }
    ctxFk = result.nextFk;
    ctxNk = result.nextNk;
    trCont = "N";
  }

  const krPositions = mergeBySymbol(
    krRows.map(toKrPosition).filter((item): item is KisPosition => item !== null),
  );

  const usRows: JsonMap[] = [];
  let overseasOk = false;
  for (const exchange of KIS_OVERSEAS_EXCHANGES) {
    try {
      const rows = await fetchOverseasPage(credentials, token, exchange, "", "");
      usRows.push(...rows);
      overseasOk = true;
    } catch {
      // Overseas is optional; keep existing US rows if every exchange fails.
    }
  }
  const usPositions = overseasOk
    ? mergeBySymbol(usRows.map(toUsPosition).filter((item): item is KisPosition => item !== null))
    : null;

  return { cashAmount, krPositions, usPositions };
}

/**
 * Split an 8-2 account number into CANO and product code.
 * @param value - e.g. 50123456-01 or 5012345601
 */
export function parseKisAccount(value: string): { cano: string; accountProductCode: string } | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }
  return {
    cano: digits.slice(0, 8),
    accountProductCode: digits.slice(8, 10),
  };
}
