# Stock Analysis Agent (MVP)

한국·미국 주식을 LangGraph 다중 에이전트로 분석하고, **단타(1–2일)** / **장기** BUY·SELL·HOLD 시그널을 PostgreSQL에 저장한 뒤 Discord로 알림합니다. **주문 기능은 포함하지 않습니다.**

## 구성

- **Universe Scan** — 한·미 유동성 유니버스(~90종목) 시세 스캔 후 단타/장기 후보 선정
- **News → Technical → Fundamental** — 후보 종목 심층 분석
- **Synthesizer** — horizon별 시그널 (`SHORT` = 단타 1–2일, `LONG` = 장기)
- **Portfolio Context** — 보유 여부 주석 (주문 없음)
- **Discord** — 종목별 알림 + 단타/장기 BUY 요약

## 빠른 시작

### 1. 환경 변수

```bash
cp .env .env
```

필수:

- `OPENAI_API_KEY`
- `DISCORD_WEBHOOK_URL` (없으면 알림만 스킵)
- `DATABASE_URL`

스캔 관련:

- `SCAN_SHORT_TOP_N` / `SCAN_LONG_TOP_N` — 심층 분석할 단타·장기 후보 수 (기본 8)
- `SCAN_MIN_AVG_VOLUME` — 유동성 필터
- `SCHEDULE_MODE` — `scan` | `watchlist` | `both`

### 2. Docker

```bash
docker compose up --build
```

### 3. 로컬

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -e .
alembic upgrade head
python -m src.main seed
python -m src.main scan
```

## CLI

| 명령 | 설명 |
|------|------|
| `python -m src.main seed` | 기본 관심종목 시드 |
| `python -m src.main once` | 관심종목만 단타+장기 분석 |
| `python -m src.main scan` | 유니버스 스캔 → 단타/장기 추천 |
| `python -m src.main schedule` | `SCHEDULE_MODE`에 따라 주기 실행 |

## 추천 로직 요약

1. KR+US 유니버스 OHLCV 일괄 다운로드
2. **단타 점수**: 모멘텀, 거래량 급증, 신고가 근접, MACD 등
3. **장기 점수**: SMA50/200 상단, 안정적 추세, 유동성
4. 상위 후보만 LLM 뉴스·기술·재무 분석
5. horizon별 BUY/SELL/HOLD + 진입/손절/익절 힌트
6. Discord 개별 알림 + 오늘의 추천 요약

> “전 종목” 전수는 무료 시세·LLM 비용상 비현실적이라, 유동성 높은 대표 유니버스를 스캔합니다. 목록은 `src/market/universe.py`에서 확장할 수 있습니다.

## Discord 알림 규칙

- **BUY / SELL**: 항상 발송 (단타/장기 라벨 포함)
- **HOLD**: `confidence >= DISCORD_MIN_CONFIDENCE` (기본 0.6)
- 실행 종료 시 **단타 BUY / 장기 BUY** 요약 임베드 1회

## 다음 단계 (미포함)

- KIS Open API 시세/주문
- Discord 매수 버튼 (Human-in-the-loop)
- 실전/모의 체결

## 면책

본 프로젝트는 교육·연구용 분석 도구이며 투자 자문이 아닙니다. 단타로 1–2일 수익을 보장하지 않습니다.
