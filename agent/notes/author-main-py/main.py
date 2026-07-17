from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Literal, Optional
import os
import uvicorn


from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.dataflows.interface import VENDOR_METHODS
from cli.stats_handler import StatsCallbackHandler
from tools.exchange import get_binance_ohlcv, get_binance_indicators
from tools.news import get_news, get_global_news
from tools.fundamentals import (
    get_fundamentals,
    get_balance_sheet,
    get_cashflow,
    get_income_statement,
    get_insider_transactions,
)

graph: Optional[TradingAgentsGraph] = None


async def startup():
    global graph
    config = DEFAULT_CONFIG.copy()

    if os.getenv("LLM_PROVIDER"):
        config["llm_provider"] = os.getenv("LLM_PROVIDER")
    if os.getenv("DEEP_THINK_LLM"):
        config["deep_think_llm"] = os.getenv("DEEP_THINK_LLM")
    if os.getenv("QUICK_THINK_LLM"):
        config["quick_think_llm"] = os.getenv("QUICK_THINK_LLM")

    def use_vendor(vendor: str, method: str, impl):
        VENDOR_METHODS[method] = {vendor: impl}
        config["tool_vendors"][method] = vendor

    config["max_debate_rounds"] = 1
    config["max_risk_discuss_rounds"] = 1

    use_vendor("binance", "get_stock_data", get_binance_ohlcv)
    use_vendor("binance", "get_indicators", get_binance_indicators)
    use_vendor("binance", "get_fundamentals", get_fundamentals)
    use_vendor("binance", "get_balance_sheet", get_balance_sheet)
    use_vendor("binance", "get_cashflow", get_cashflow)
    use_vendor("binance", "get_income_statement", get_income_statement)
    use_vendor("binance", "get_insider_transactions", get_insider_transactions)
    use_vendor("ddgs", "get_news", get_news)
    use_vendor("ddgs", "get_global_news", get_global_news)

    stats_handler = StatsCallbackHandler()
    graph = TradingAgentsGraph(
        selected_analysts=["social", "news"],
        debug=True,
        config=config,
        callbacks=[stats_handler],
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    await startup()
    yield


app = FastAPI(title="TradingAgents API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request models ---

class PropagateRequest(BaseModel):
    company_name: str
    trade_date: str  # ISO format: YYYY-MM-DD


class ReflectRequest(BaseModel):
    returns_losses: float


class ProcessSignalRequest(BaseModel):
    full_signal: str


# --- Response models ---

class InvestDebateStateResponse(BaseModel):
    bull_history: str
    bear_history: str
    history: str
    current_response: str
    judge_decision: str
    count: int


class RiskDebateStateResponse(BaseModel):
    aggressive_history: str
    conservative_history: str
    neutral_history: str
    history: str
    latest_speaker: str
    current_aggressive_response: str
    current_conservative_response: str
    current_neutral_response: str
    judge_decision: str
    count: int


class FinalStateResponse(BaseModel):
    company_of_interest: str
    trade_date: str
    market_report: str
    sentiment_report: str
    news_report: str
    fundamentals_report: str
    investment_debate_state: InvestDebateStateResponse
    investment_plan: str
    trader_investment_plan: str
    risk_debate_state: RiskDebateStateResponse
    final_trade_decision: str


class PropagateResponse(BaseModel):
    final_state: FinalStateResponse
    signal: Literal["BUY", "OVERWEIGHT", "HOLD", "UNDERWEIGHT", "SELL"]


class ReflectResponse(BaseModel):
    ok: bool


class ProcessSignalResponse(BaseModel):
    result: Literal["BUY", "OVERWEIGHT", "HOLD", "UNDERWEIGHT", "SELL"]


class HealthResponse(BaseModel):
    status: str
    graph_loaded: bool


# --- Endpoints ---

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/api/v1/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", graph_loaded=graph is not None)


@app.post("/api/v1/propagate", response_model=PropagateResponse)
async def propagate(req: PropagateRequest):
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")
    final_state, signal = graph.propagate(req.company_name, req.trade_date)
    return PropagateResponse(
        final_state=FinalStateResponse(**{
            k: final_state[k] for k in FinalStateResponse.model_fields
        }),
        signal=signal,
    )


@app.post("/api/v1/reflect_and_remember", response_model=ReflectResponse)
async def reflect_and_remember(req: ReflectRequest):
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")
    graph.reflect_and_remember(req.returns_losses)
    return ReflectResponse(ok=True)


@app.post("/api/v1/process_signal", response_model=ProcessSignalResponse)
async def process_signal(req: ProcessSignalRequest):
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")
    result = graph.process_signal(req.full_signal)
    return ProcessSignalResponse(result=result)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
