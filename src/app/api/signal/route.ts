import { NextResponse } from "next/server";
import { Candle, SignalResponse } from "@/lib/types";
import { computeTradeSignal } from "@/lib/signal";

export const dynamic = "force-dynamic"; // avoid static caching

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

function parseBinanceKlines(raw: any[]): Candle[] {
  // Binance kline: [ openTime, open, high, low, close, volume, closeTime, ...]
  return raw.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
  }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = (searchParams.get("interval") || "1h").toLowerCase();

  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: `Invalid interval. Use one of: ${Array.from(ALLOWED_INTERVALS).join(", ")}` }, { status: 400 });
  }

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Binance API error: ${text}` }, { status: res.status });
    }
    const raw = await res.json();
    const candles = parseBinanceKlines(raw);

    const { signal, indicators } = computeTradeSignal(candles);
    const last = candles[candles.length - 1];

    const body: SignalResponse = {
      symbol,
      interval,
      timestamp: last.closeTime,
      lastPrice: last.close,
      signal,
      indicators,
    };

    return NextResponse.json(body);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}