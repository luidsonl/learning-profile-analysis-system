PYTHON ?= .venv/bin/python
VERSION ?= 2.0.0

.PHONY: setup train package sanity clean

setup:
	python3 -m venv .venv
	.venv/bin/pip install --quiet -r requirements.txt

train:
	$(PYTHON) -m features.prepare
	$(PYTHON) -m train.train

package:
	$(PYTHON) -m serve.package --version $(VERSION)

sanity:
	$(PYTHON) -m serve.sanity

smoke-lambda:
	$(PYTHON) tests/inference_smoke.py

clean:
	rm -rf build .venv
