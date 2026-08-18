import { NextResponse } from "next/server";

import { isAuthResult, requireApiUser } from "@/lib/api";
import { fetchKisHoldings, parseKisAccount, type KisEnvironment } from "@/lib/kis/client";
import {
  applyKisHoldings,
  deleteKisCredentials,
  fetchKisCredentialStatus,
  loadKisCredentials,
  saveKisCredentials,
} from "@/lib/queries";

function parseEnvironment(value: unknown): KisEnvironment | null {
  return value === "real" || value === "paper" ? value : null;
}

/**
 * Return saved Korea Investment accounts. Secrets are not included.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const status = await fetchKisCredentialStatus();
  return NextResponse.json(status);
}

/**
 * Import Korea Investment holdings and merge them into existing positions.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const appKey = String(body.appKey || "").trim();
  const appSecret = String(body.appSecret || "").trim();
  const accountRaw = String(body.account || "").trim();
  const environment = parseEnvironment(body.environment);
  const useSaved = Boolean(body.useSaved) || (!appKey && !appSecret);

  try {
    let credentials;
    if (appKey && appSecret && environment && parseKisAccount(accountRaw)) {
      const account = parseKisAccount(accountRaw);
      if (!account) {
        return NextResponse.json({ error: "계좌번호(8-2)를 확인하세요." }, { status: 400 });
      }
      credentials = {
        appKey,
        appSecret,
        cano: account.cano,
        accountProductCode: account.accountProductCode,
        environment,
      };
      await saveKisCredentials({
        appKey,
        appSecret,
        account: accountRaw,
        environment,
      });
    } else if (useSaved) {
      if (!parseKisAccount(accountRaw)) {
        return NextResponse.json(
          { error: "저장된 키를 쓰려면 계좌번호(8-2)를 입력하세요." },
          { status: 400 },
        );
      }
      credentials = await loadKisCredentials(accountRaw);
      if (!credentials) {
        return NextResponse.json(
          { error: "이 계좌번호로 저장된 앱키가 없습니다. 앱키를 다시 입력하세요." },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "앱키, 앱시크릿, 계좌번호(8-2), 실전/모의를 확인하세요." },
        { status: 400 },
      );
    }

    const snapshot = await fetchKisHoldings(credentials);
    const portfolio = await applyKisHoldings(snapshot);
    const kis = await fetchKisCredentialStatus();
    return NextResponse.json({
      ...portfolio,
      imported: {
        krCount: snapshot.krPositions.length,
        usCount: snapshot.usPositions ? snapshot.usPositions.length : null,
      },
      kis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "한국투자 잔고를 가져오지 못했습니다.";
    const status = message.includes("KIS_CREDENTIALS_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Forget encrypted Korea Investment keys for an account, or all accounts.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const url = new URL(request.url);
  const account = String(url.searchParams.get("account") || "").trim();
  await deleteKisCredentials(account || undefined);
  const kis = await fetchKisCredentialStatus();
  return NextResponse.json(kis);
}
