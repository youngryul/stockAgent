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
    {"symbol": "005930.KS", "market": "KR", "name": "Samsung Electronics"},
    {"symbol": "000660.KS", "market": "KR", "name": "SK Hynix"},
    {"symbol": "005380.KS", "market": "KR", "name": "Hyundai Motor"},
    {"symbol": "000270.KS", "market": "KR", "name": "Kia"},
    {"symbol": "035420.KS", "market": "KR", "name": "NAVER"},
    {"symbol": "035720.KS", "market": "KR", "name": "Kakao"},
    {"symbol": "051910.KS", "market": "KR", "name": "LG Chem"},
    {"symbol": "006400.KS", "market": "KR", "name": "Samsung SDI"},
    {"symbol": "207940.KS", "market": "KR", "name": "Samsung Biologics"},
    {"symbol": "068270.KS", "market": "KR", "name": "Celltrion"},
    {"symbol": "005490.KS", "market": "KR", "name": "POSCO Holdings"},
    {"symbol": "105560.KS", "market": "KR", "name": "KB Financial"},
    {"symbol": "055550.KS", "market": "KR", "name": "Shinhan Financial"},
    {"symbol": "086790.KS", "market": "KR", "name": "Hana Financial"},
    {"symbol": "032830.KS", "market": "KR", "name": "Samsung Life"},
    {"symbol": "015760.KS", "market": "KR", "name": "KEPCO"},
    {"symbol": "034730.KS", "market": "KR", "name": "SK Inc"},
    {"symbol": "003550.KS", "market": "KR", "name": "LG Corp"},
    {"symbol": "066570.KS", "market": "KR", "name": "LG Electronics"},
    {"symbol": "009150.KS", "market": "KR", "name": "Samsung Electro-Mechanics"},
    {"symbol": "012330.KS", "market": "KR", "name": "Hyundai Mobis"},
    {"symbol": "028260.KS", "market": "KR", "name": "Samsung C&T"},
    {"symbol": "096770.KS", "market": "KR", "name": "SK Innovation"},
    {"symbol": "003670.KS", "market": "KR", "name": "POSCO Future M"},
    {"symbol": "247540.KQ", "market": "KR", "name": "Ecopro BM"},
    {"symbol": "086520.KQ", "market": "KR", "name": "Ecopro"},
    {"symbol": "196170.KQ", "market": "KR", "name": "Alteogen"},
    {"symbol": "028300.KQ", "market": "KR", "name": "HLB"},
    {"symbol": "041510.KQ", "market": "KR", "name": "SM Entertainment"},
    {"symbol": "035900.KQ", "market": "KR", "name": "JYP Entertainment"},
    {"symbol": "259960.KS", "market": "KR", "name": "Krafton"},
    {"symbol": "036570.KS", "market": "KR", "name": "NCsoft"},
    {"symbol": "251270.KS", "market": "KR", "name": "Netmarble"},
    {"symbol": "011200.KS", "market": "KR", "name": "HMM"},
    {"symbol": "010130.KS", "market": "KR", "name": "Korea Zinc"},
    {"symbol": "009540.KS", "market": "KR", "name": "HD Korea Shipbuilding"},
    {"symbol": "042660.KS", "market": "KR", "name": "Hanwha Ocean"},
    {"symbol": "267250.KS", "market": "KR", "name": "HD Hyundai"},
    {"symbol": "018260.KS", "market": "KR", "name": "Samsung SDS"},
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
