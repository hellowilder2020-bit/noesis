.PHONY: venv install run-backend test run-frontend clean

# Works on POSIX (.venv/bin) and Windows (.venv/Scripts).
ifeq ($(OS),Windows_NT)
VENV_PY  := .venv/Scripts/python.exe
VENV_BIN := .venv/Scripts
else
VENV_PY  := .venv/bin/python
VENV_BIN := .venv/bin
endif

venv:
	$(VENV_PY) -m venv .venv

install:
	$(VENV_PY) -m pip install -U pip
	$(VENV_PY) -m pip install -e "backend[dev]" "semgrep>=1.80" "GitPython>=3.1"

run-backend:
	$(VENV_BIN)/uvicorn aipentester.main:app --reload --port 8000

test:
	$(VENV_PY) -m pytest backend/tests

run-frontend:
	cd frontend && npm run dev

clean:
	rm -rf .pytest_cache backend/.pytest_cache backend/**/__pycache__ backend/.ruff_cache
