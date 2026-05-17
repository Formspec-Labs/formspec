"""``python -m formspec.validate`` entrypoint."""
from __future__ import annotations

import sys

from formspec.validate.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
