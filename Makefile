.PHONY: venv install run-backend test run-frontend clean

venv:
	python3 -m venv .venv

install:
	.venv/bin/pip install -U pip
	.venv/bin/pip install -e "backend[dev]" "semgrep>=1.80" "GitPython>=3.1"

run-backend:
	.venv/bin/uvicorn aipentester.main:app --reload --port 8000

test:
	.venv/bin/pytest backend/tests

run-frontend:
	cd frontend && npm run dev

clean:
	rm -rf .pytest_cache backend/.pytest_cache backend/**/__pycache__ backend/.ruff_cache
