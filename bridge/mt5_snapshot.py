#!/usr/bin/env python3
"""Optional local, read-only MT5 demo snapshot exporter. No credentials or orders."""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import importlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
import time

TIMEFRAMES = {"M5": ("5m", "TIMEFRAME_M5"), "M15": ("15m", "TIMEFRAME_M15"),
              "H1": ("1h", "TIMEFRAME_H1"), "H4": ("4h", "TIMEFRAME_H4"),
              "D1": ("1D", "TIMEFRAME_D1")}
ERRORS = {"unsupported_platform", "terminal_not_running", "sdk_unavailable", "attach_failed",
          "terminal_mismatch", "demo_required", "account_changed", "terminal_disconnected",
          "snapshot_unavailable", "snapshot_invalid"}


def normalized_path(value: str) -> str:
    return os.path.normcase(os.path.abspath(os.path.normpath(value)))


def running_terminal_pid(terminal: str) -> int | None:
    """Check the full executable path with Win32 process APIs; never start a terminal."""
    if os.name != "nt":
        return None
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260)]

    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
    kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                                wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)
    if not snapshot or snapshot == ctypes.c_void_p(-1).value:
        return None
    entry = PROCESSENTRY32W()
    entry.dwSize = ctypes.sizeof(entry)
    wanted = normalized_path(terminal)
    try:
        exists = kernel.Process32FirstW(snapshot, ctypes.byref(entry))
        while exists:
            if entry.szExeFile.casefold() == Path(terminal).name.casefold():
                process = kernel.OpenProcess(0x1000, False, entry.th32ProcessID)
                if process:
                    try:
                        size = wintypes.DWORD(32768)
                        path = ctypes.create_unicode_buffer(size.value)
                        if (kernel.QueryFullProcessImageNameW(process, 0, path, ctypes.byref(size))
                                and normalized_path(path.value) == wanted):
                            return int(entry.th32ProcessID)
                    finally:
                        kernel.CloseHandle(process)
            exists = kernel.Process32NextW(snapshot, ctypes.byref(entry))
    finally:
        kernel.CloseHandle(snapshot)
    return None


def finite(value: object, *, minimum: float | None = None, integer: bool = False) -> float | int:
    if isinstance(value, bool):
        raise ValueError("invalid_number")
    number = float(value)
    if not math.isfinite(number) or (minimum is not None and number < minimum):
        raise ValueError("invalid_number")
    if integer:
        if number != int(number) or abs(number) > 9007199254740991:
            raise ValueError("invalid_integer")
        return int(number)
    return number


def disconnected(error: str, captured_at: int | None = None) -> dict:
    return {"version": 1, "source": "mt5", "capturedAt": captured_at or int(time.time()),
            "connected": False, "error": error if error in ERRORS else "snapshot_unavailable"}


def atomic_write(output: Path, payload: dict) -> None:
    """Atomically replace JSON; the caller must protect the containing directory."""
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".mt5-snapshot-", suffix=".json", dir=output.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, output)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


class DemoReader:
    def __init__(self, terminal: str, symbol: str, timeframe: str, bars: int):
        self.terminal, self.symbol, self.timeframe, self.bars = terminal, symbol, timeframe, bars
        self.sdk = None
        self.pid = None
        self.account_key = None
        self.attached = False

    def close(self) -> None:
        if self.sdk is not None and self.attached:
            try:
                self.sdk.shutdown()
            except Exception:
                pass
        self.attached = False

    def read(self) -> dict:
        try:
            return self._read()
        except (ValueError, TypeError, OverflowError, AttributeError):
            return disconnected("snapshot_invalid")
        except Exception:
            # Raw SDK / OS errors may contain private terminal paths or account details.
            return disconnected("snapshot_unavailable")

    def _read(self) -> dict:
        now = int(time.time())
        if os.name != "nt":
            return disconnected("unsupported_platform", now)
        pid = running_terminal_pid(self.terminal)
        if pid is None:
            self.close()
            return disconnected("terminal_not_running", now)
        if self.sdk is None:
            try:
                self.sdk = importlib.import_module("MetaTrader5")
            except ImportError:
                return disconnected("sdk_unavailable", now)
        sdk = self.sdk
        if not self.attached:
            # Explicit path plus the existing-process guard prevents normal SDK auto-discovery.
            if not sdk.initialize(self.terminal, timeout=5000):
                return disconnected("attach_failed", now)
            self.attached, self.pid = True, pid
        elif pid != self.pid:
            self.close()
            return disconnected("terminal_not_running", now)
        terminal = sdk.terminal_info()
        if terminal is None or normalized_path(str(terminal.path)) != normalized_path(str(Path(self.terminal).parent)):
            self.close()
            return disconnected("terminal_mismatch", now)
        account = sdk.account_info()
        if account is None or account.trade_mode != sdk.ACCOUNT_TRADE_MODE_DEMO:
            return disconnected("demo_required", now)
        # Hold identity only in memory. Never serialize login, name, server or company.
        key = (account.login, account.server)
        if self.account_key is None:
            self.account_key = key
        elif key != self.account_key:
            return disconnected("account_changed", now)
        if not terminal.connected:
            return disconnected("terminal_disconnected", now)
        spec = sdk.symbol_info(self.symbol)
        tick = sdk.symbol_info_tick(self.symbol)
        bars = sdk.copy_rates_from_pos(self.symbol, getattr(sdk, TIMEFRAMES[self.timeframe][1]), 0, self.bars)
        positions, orders = sdk.positions_total(), sdk.orders_total()
        if spec is None or tick is None or bars is None or len(bars) < 2 or positions is None or orders is None:
            return disconnected("snapshot_unavailable", now)
        candles = []
        previous, total_volume = -1, 0.0
        for bar in bars:
            candle = {"time": finite(bar["time"], minimum=0, integer=True),
                      "open": finite(bar["open"], minimum=1e-300),
                      "high": finite(bar["high"], minimum=1e-300),
                      "low": finite(bar["low"], minimum=1e-300),
                      "close": finite(bar["close"], minimum=1e-300),
                      "volume": finite(bar["tick_volume"], minimum=0, integer=True)}
            if (candle["time"] <= previous or candle["time"] > min(4102444800, now + 300)
                    or candle["low"] > min(candle["open"], candle["close"])
                    or candle["high"] < max(candle["open"], candle["close"])):
                raise ValueError("invalid_candles")
            total_volume += candle["volume"]
            if not math.isfinite(total_volume):
                raise ValueError("volume_overflow")
            previous = candle["time"]
            candles.append(candle)
        bid, ask = finite(tick.bid, minimum=1e-300), finite(tick.ask, minimum=1e-300)
        quote_time = finite(tick.time, minimum=1, integer=True)
        if ask < bid or quote_time > now + 300:
            raise ValueError("invalid_quote")
        decimals = finite(spec.digits, minimum=0, integer=True)
        if decimals > 10:
            raise ValueError("invalid_decimals")
        currency = str(account.currency)
        if not re.fullmatch(r"[A-Za-z0-9]{2,12}", currency):
            raise ValueError("invalid_currency")
        # Recheck mode/identity after reading so a mid-snapshot account switch cannot mix data.
        after = sdk.account_info()
        if after is None or after.trade_mode != sdk.ACCOUNT_TRADE_MODE_DEMO:
            return disconnected("demo_required", now)
        if (after.login, after.server) != self.account_key:
            return disconnected("account_changed", now)
        return {"version": 1, "source": "mt5", "capturedAt": now, "connected": True, "demo": True,
                "symbol": self.symbol, "timeframe": TIMEFRAMES[self.timeframe][0], "candles": candles,
                "quote": {"bid": bid, "ask": ask, "time": quote_time},
                "spec": {"decimals": decimals, "contractSize": finite(spec.trade_contract_size, minimum=1e-300),
                         "minLots": finite(spec.volume_min, minimum=1e-300), "lotStep": finite(spec.volume_step, minimum=1e-300)},
                "account": {"balance": finite(account.balance), "equity": finite(account.equity),
                            "freeMargin": finite(account.margin_free), "currency": currency,
                            "positionsCount": finite(positions, minimum=0, integer=True),
                            "ordersCount": finite(orders, minimum=0, integer=True)}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terminal", required=True, help="Full path of an already running MT5 executable")
    parser.add_argument("--output", required=True, type=Path, help="Private snapshot JSON outside source/repository folders")
    parser.add_argument("--interval", default=2.0, type=float)
    parser.add_argument("--bars", default=600, type=int)
    parser.add_argument("--symbol", default="XAUUSD")
    parser.add_argument("--timeframe", default="M15", choices=TIMEFRAMES)
    parser.add_argument("--stop-file", type=Path, help="Optional private sentinel file; create it to stop this exporter cleanly")
    parser.add_argument("--once", action="store_true", help="Write one snapshot and exit")
    args = parser.parse_args()
    if not 2 <= args.interval <= 3600 or not 2 <= args.bars <= 600:
        parser.error("interval must be 2–3600 seconds and bars must be 2–600")
    if not re.fullmatch(r"[A-Za-z0-9_.#-]{1,32}", args.symbol):
        parser.error("symbol must be an exact simple broker symbol of at most 32 characters")
    reader = DemoReader(args.terminal, args.symbol, args.timeframe, args.bars)
    try:
        while True:
            if args.stop_file is not None and args.stop_file.exists():
                return 0
            started = time.monotonic()
            result = reader.read()
            try:
                atomic_write(args.output, result)
            except OSError:
                print("Snapshot output is not writable.")
                return 2
            if args.once:
                # No raw market data or private account summary is printed to the console.
                print("MT5 demo snapshot saved." if result["connected"] else "MT5 snapshot unavailable: " + result["error"])
                return 0 if result["connected"] else 1
            deadline = started + args.interval
            while time.monotonic() < deadline:
                if args.stop_file is not None and args.stop_file.exists():
                    return 0
                time.sleep(min(0.5, max(0.01, deadline - time.monotonic())))
    except KeyboardInterrupt:
        return 0
    finally:
        reader.close()


if __name__ == "__main__":
    raise SystemExit(main())
