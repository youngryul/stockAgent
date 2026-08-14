"""Curated KR/US liquid equity universes for scanning.

Full market coverage is impractical with free data + LLM cost, so we scan a
broad liquid set and rank candidates before deep analysis.
"""

from __future__ import annotations

from typing import TypedDict


class UniverseSymbol(TypedDict):
    symbol: str
    market: str
    name: str


# Major KOSPI / KOSDAQ liquid names (yfinance tickers).
KR_UNIVERSE: list[UniverseSymbol] = [
    {"symbol": "005930.KS", "market": "KR", "name": "삼성전자"},
    {"symbol": "000660.KS", "market": "KR", "name": "SK하이닉스"},
    {"symbol": "005380.KS", "market": "KR", "name": "현대차"},
    {"symbol": "000270.KS", "market": "KR", "name": "기아"},
    {"symbol": "035420.KS", "market": "KR", "name": "네이버"},
    {"symbol": "035720.KS", "market": "KR", "name": "카카오"},
    {"symbol": "051910.KS", "market": "KR", "name": "LG화학"},
    {"symbol": "006400.KS", "market": "KR", "name": "삼성SDI"},
    {"symbol": "207940.KS", "market": "KR", "name": "삼성바이오로직스"},
    {"symbol": "068270.KS", "market": "KR", "name": "셀트리온"},
    {"symbol": "005490.KS", "market": "KR", "name": "POSCO홀딩스"},
    {"symbol": "105560.KS", "market": "KR", "name": "KB금융"},
    {"symbol": "055550.KS", "market": "KR", "name": "신한지주"},
    {"symbol": "086790.KS", "market": "KR", "name": "하나금융지주"},
    {"symbol": "032830.KS", "market": "KR", "name": "삼성생명"},
    {"symbol": "015760.KS", "market": "KR", "name": "한국전력"},
    {"symbol": "034730.KS", "market": "KR", "name": "SK"},
    {"symbol": "003550.KS", "market": "KR", "name": "LG"},
    {"symbol": "066570.KS", "market": "KR", "name": "LG전자"},
    {"symbol": "009150.KS", "market": "KR", "name": "삼성전기"},
    {"symbol": "012330.KS", "market": "KR", "name": "현대모비스"},
    {"symbol": "028260.KS", "market": "KR", "name": "삼성물산"},
    {"symbol": "096770.KS", "market": "KR", "name": "SK이노베이션"},
    {"symbol": "003670.KS", "market": "KR", "name": "포스코퓨처엠"},
    {"symbol": "247540.KQ", "market": "KR", "name": "에코프로비엠"},
    {"symbol": "086520.KQ", "market": "KR", "name": "에코프로"},
    {"symbol": "196170.KQ", "market": "KR", "name": "알테오젠"},
    {"symbol": "028300.KQ", "market": "KR", "name": "HLB"},
    {"symbol": "041510.KQ", "market": "KR", "name": "에스엠"},
    {"symbol": "035900.KQ", "market": "KR", "name": "JYP엔터"},
    {"symbol": "259960.KS", "market": "KR", "name": "크래프톤"},
    {"symbol": "036570.KS", "market": "KR", "name": "엔씨소프트"},
    {"symbol": "251270.KS", "market": "KR", "name": "넷마블"},
    {"symbol": "011200.KS", "market": "KR", "name": "HMM"},
    {"symbol": "010130.KS", "market": "KR", "name": "고려아연"},
    {"symbol": "009540.KS", "market": "KR", "name": "HD한국조선해양"},
    {"symbol": "042660.KS", "market": "KR", "name": "한화오션"},
    {"symbol": "267250.KS", "market": "KR", "name": "HD현대"},
    {"symbol": "018260.KS", "market": "KR", "name": "삼성SDS"},
    {"symbol": "033780.KS", "market": "KR", "name": "KT&G"},
]

# Liquid US large/mid caps across sectors.
US_UNIVERSE: list[UniverseSymbol] = [
    {"symbol": "AAPL", "market": "US", "name": "Apple"},
    {"symbol": "MSFT", "market": "US", "name": "Microsoft"},
    {"symbol": "NVDA", "market": "US", "name": "NVIDIA"},
    {"symbol": "AMZN", "market": "US", "name": "Amazon"},
    {"symbol": "GOOGL", "market": "US", "name": "Alphabet"},
    {"symbol": "META", "market": "US", "name": "Meta"},
    {"symbol": "TSLA", "market": "US", "name": "Tesla"},
    {"symbol": "AVGO", "market": "US", "name": "Broadcom"},
    {"symbol": "BRK-B", "market": "US", "name": "Berkshire Hathaway"},
    {"symbol": "JPM", "market": "US", "name": "JPMorgan"},
    {"symbol": "V", "market": "US", "name": "Visa"},
    {"symbol": "MA", "market": "US", "name": "Mastercard"},
    {"symbol": "UNH", "market": "US", "name": "UnitedHealth"},
    {"symbol": "XOM", "market": "US", "name": "Exxon Mobil"},
    {"symbol": "JNJ", "market": "US", "name": "Johnson & Johnson"},
    {"symbol": "WMT", "market": "US", "name": "Walmart"},
    {"symbol": "PG", "market": "US", "name": "Procter & Gamble"},
    {"symbol": "HD", "market": "US", "name": "Home Depot"},
    {"symbol": "COST", "market": "US", "name": "Costco"},
    {"symbol": "NFLX", "market": "US", "name": "Netflix"},
    {"symbol": "AMD", "market": "US", "name": "AMD"},
    {"symbol": "INTC", "market": "US", "name": "Intel"},
    {"symbol": "QCOM", "market": "US", "name": "Qualcomm"},
    {"symbol": "ORCL", "market": "US", "name": "Oracle"},
    {"symbol": "CRM", "market": "US", "name": "Salesforce"},
    {"symbol": "ADBE", "market": "US", "name": "Adobe"},
    {"symbol": "CSCO", "market": "US", "name": "Cisco"},
    {"symbol": "IBM", "market": "US", "name": "IBM"},
    {"symbol": "NOW", "market": "US", "name": "ServiceNow"},
    {"symbol": "PLTR", "market": "US", "name": "Palantir"},
    {"symbol": "UBER", "market": "US", "name": "Uber"},
    {"symbol": "COIN", "market": "US", "name": "Coinbase"},
    {"symbol": "BA", "market": "US", "name": "Boeing"},
    {"symbol": "CAT", "market": "US", "name": "Caterpillar"},
    {"symbol": "GE", "market": "US", "name": "GE Aerospace"},
    {"symbol": "DIS", "market": "US", "name": "Disney"},
    {"symbol": "NKE", "market": "US", "name": "Nike"},
    {"symbol": "SBUX", "market": "US", "name": "Starbucks"},
    {"symbol": "PEP", "market": "US", "name": "PepsiCo"},
    {"symbol": "KO", "market": "US", "name": "Coca-Cola"},
    {"symbol": "MRK", "market": "US", "name": "Merck"},
    {"symbol": "PFE", "market": "US", "name": "Pfizer"},
    {"symbol": "LLY", "market": "US", "name": "Eli Lilly"},
    {"symbol": "ABBV", "market": "US", "name": "AbbVie"},
    {"symbol": "TSM", "market": "US", "name": "TSMC"},
    {"symbol": "ASML", "market": "US", "name": "ASML"},
    {"symbol": "MU", "market": "US", "name": "Micron"},
    {"symbol": "SMCI", "market": "US", "name": "Super Micro"},
    {"symbol": "ARM", "market": "US", "name": "Arm Holdings"},
    {"symbol": "SHOP", "market": "US", "name": "Shopify"},
]


def get_default_universe() -> list[UniverseSymbol]:
    """Return the combined KR + US scan universe (deduped by symbol)."""
    seen: set[str] = set()
    out: list[UniverseSymbol] = []
    for item in [*KR_UNIVERSE, *US_UNIVERSE]:
        if item["symbol"] in seen:
            continue
        seen.add(item["symbol"])
        out.append(item)
    return out


_UNIVERSE_NAME_BY_SYMBOL: dict[str, str] = {
    item["symbol"]: item["name"] for item in [*KR_UNIVERSE, *US_UNIVERSE]
}


def lookup_symbol_name(symbol: str) -> str:
    """Return the curated display name for a ticker, or empty string if unknown."""
    return _UNIVERSE_NAME_BY_SYMBOL.get(symbol, "")


def resolve_symbol_name(symbol: str, fallback: str | None = None) -> str:
    """Return curated name, then fallback, then the ticker itself."""
    return lookup_symbol_name(symbol) or (fallback or "").strip() or symbol

