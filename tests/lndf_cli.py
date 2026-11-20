#!/usr/bin/env python3
"""Run the lndf CLI's validate command with validate.py's arguments.

    python3 tests/run.py --validator tests/lndf_cli.py

Set LNDF_CLI to test a CLI other than cli/dist/cli.js (build it first with
npm run build in cli/).
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
cli = os.environ.get("LNDF_CLI") or os.path.join(HERE, "..", "cli", "dist", "cli.js")
# @lndf:constraint a Python shim that calls node | run.py starts the validator as [sys.executable, validator], so it must be a Python script
sys.exit(subprocess.call(["node", cli, "validate"] + sys.argv[1:]))
