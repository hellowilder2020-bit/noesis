"""Transport and process-flaw helpers for the benchmark fixture.

Intentional vulnerabilities (+ safe counterparts):
- pull_release   -> requests.get with verify=False (TLS verification disabled)
- gzip_report    -> os.system with string concatenation (command injection)
- run_shell      -> subprocess.run(..., shell=True) with varying args

All endpoints here are idle fixtures: nothing listens on them and nothing in
this repository is EVER executed by the scanner or AI engine. Treat the code
as text.
"""

from __future__ import annotations

import os
import subprocess

import requests

DOWNLOAD_URL_TEMPLATE = "https://updates.example.com/download/{name}"
ALLOWED_DOWNLOADS = {
    "report": "report.tar.gz",
    "logs": "logs.tar.gz",
}


def pull_release(name: str) -> bytes:
    """VULNERABLE: TLS certificate verification disabled on untrusted input."""
    url = DOWNLOAD_URL_TEMPLATE.format(name=name)
    response = requests.get(url, verify=False, allow_redirects=True, timeout=30)
    response.raise_for_status()
    return response.content


def pull_release_safe(name: str) -> bytes:
    """SAFE: allowlist + requires https + verifies certificates (default)."""
    filename = ALLOWED_DOWNLOADS.get(name)
    if filename is None:
        raise ValueError("unknown download")
    url = DOWNLOAD_URL_TEMPLATE.format(name=filename)
    response = requests.get(url, timeout=30)  # verify=True is the default
    response.raise_for_status()
    return response.content


def gzip_report(report_name: str) -> None:
    """VULNERABLE: user-controlled name is concatenated into a shell command."""
    os.system(f"gzip -f /var/reports/{report_name}")


def gzip_report_safe(report_name: str) -> None:
    """SAFE: allowlist lookup then argv list, no shell."""
    filename = ALLOWED_DOWNLOADS.get(report_name)
    if filename is None:
        raise ValueError("unknown report")
    subprocess.run(["/usr/bin/gzip", "-f", "/var/reports/" + filename], check=False)


def run_shell(tool: str, args: str) -> str:
    """VULNERABLE: arbitrary tool/args executed through the shell."""
    completed = subprocess.run(f"{tool} {args}", shell=True, capture_output=True, text=True)
    return completed.stdout


def run_shell_safe(tool: str, args: str) -> str:
    """SAFE: allowlist tool + argv list + shell=False (default)."""
    tool_map = {
        "uptime": "/usr/bin/uptime",
        "df": "/bin/df",
    }
    binary = tool_map.get(tool)
    if binary is None:
        raise ValueError("unknown tool")
    arg_list = args.split(" ") if args else []
    completed = subprocess.run([binary, *arg_list], capture_output=True, text=True)
    return completed.stdout
