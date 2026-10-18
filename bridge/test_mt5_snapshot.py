"""Offline adapter safety tests; no installed MT5 SDK or broker required."""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("snapshot", Path(__file__).with_name("mt5_snapshot.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeSDK:
    ACCOUNT_TRADE_MODE_DEMO = 0
    TIMEFRAME_M15 = 15

    def __init__(self):
        self.account = SimpleNamespace(login=1, server="Demo", trade_mode=0, balance=50, equity=50,
                                       margin_free=50, currency="USD")
        self.initializations = []
        self.closed = False

    def initialize(self, *args, **kwargs):
        self.initializations.append((args, kwargs))
        return True

    def shutdown(self):
        self.closed = True

    def terminal_info(self):
        return SimpleNamespace(path="/terminal", connected=True)

    def account_info(self):
        return self.account

    def symbol_info(self, _):
        return SimpleNamespace(digits=2, trade_contract_size=100, volume_min=.01, volume_step=.01)

    def symbol_info_tick(self, _):
        return SimpleNamespace(bid=100, ask=100.1, time=1000)

    def copy_rates_from_pos(self, *_):
        return [{"time": 100, "open": 100, "high": 102, "low": 99, "close": 101, "tick_volume": 10},
                {"time": 200, "open": 101, "high": 102, "low": 99, "close": 100, "tick_volume": 12}]

    def positions_total(self): return 0
    def orders_total(self): return 0


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.sdk = FakeSDK()
        self.reader = module.DemoReader("/terminal/terminal64.exe", "XAUUSD", "M15", 600)
        self.reader.sdk = self.sdk
        self.platform = patch.object(module, "os", SimpleNamespace(name="nt", path=os.path))
        self.platform.start()
        self.guard = patch.object(module, "running_terminal_pid", return_value=10)
        self.guard.start()

    def tearDown(self):
        self.guard.stop()
        self.platform.stop()

    def test_valid_snapshot_has_only_safe_account_summary(self):
        result = self.reader.read()
        self.assertTrue(result["connected"])
        self.assertEqual(len(result["candles"]), 2)
        self.assertEqual(set(result["account"]), {"balance", "equity", "freeMargin", "currency", "positionsCount", "ordersCount"})
        self.assertNotIn('"login"', json.dumps(result))
        self.assertNotIn('"server"', json.dumps(result))
        self.assertEqual(self.sdk.initializations, [(("/terminal/terminal64.exe",), {"timeout": 5000})])

    def test_missing_process_does_not_initialize_or_auto_discover(self):
        with patch.object(module, "running_terminal_pid", return_value=None):
            self.assertEqual(self.reader.read()["error"], "terminal_not_running")
        self.assertEqual(self.sdk.initializations, [])

    def test_real_account_and_later_account_switch_are_refused(self):
        self.sdk.account.trade_mode = 2
        self.assertEqual(self.reader.read()["error"], "demo_required")
        self.sdk.account.trade_mode = 0
        self.assertTrue(self.reader.read()["connected"])
        self.sdk.account.login = 2
        self.assertEqual(self.reader.read()["error"], "account_changed")

    def test_raw_exception_and_nonfinite_money_are_not_exported(self):
        self.sdk.account.equity = float('nan')
        self.assertEqual(self.reader.read()["error"], "snapshot_invalid")
        self.sdk.account.equity = 50
        with patch.object(self.sdk, "symbol_info", side_effect=RuntimeError('private account details')):
            result = self.reader.read()
        self.assertEqual(result["error"], "snapshot_unavailable")
        self.assertNotIn('private', json.dumps(result))

    def test_stop_sentinel_exits_cleanly_without_extra_reads(self):
        self.platform.stop()
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as directory:
            stop = Path(directory)/"snapshot.stop"
            reader = SimpleNamespace(read=Mock(return_value=module.disconnected("terminal_not_running", 1000)), close=Mock())
            arguments = ["mt5_snapshot.py", "--terminal", "/terminal/terminal64.exe", "--output", str(Path(directory)/"snapshot.json"), "--stop-file", str(stop)]
            with patch.object(module, "DemoReader", return_value=reader), patch.object(module, "atomic_write", side_effect=lambda *_: stop.touch()), patch("sys.argv", arguments):
                self.assertEqual(module.main(), 0)
            reader.read.assert_called_once()
            reader.close.assert_called_once()
        self.platform.start()

    def test_atomic_output_is_complete_and_private(self):
        # Restore the actual OS module for file operations.
        self.platform.stop()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"snapshot.json"
            module.atomic_write(path, module.disconnected("terminal_not_running", 1000))
            self.assertEqual(json.loads(path.read_text())["connected"], False)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(Path(directory).iterdir()), [path])
        self.platform.start()


if __name__ == "__main__": unittest.main()
