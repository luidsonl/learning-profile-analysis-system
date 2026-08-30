PYTHON ?= .venv/bin/python
MODEL ?= vark
VERSION ?= 1.0.0

.PHONY: setup train package package-all sanity smoke-lambda clean

setup:
	python3 -m venv .venv
	.venv/bin/pip install --quiet -r requirements.txt

train:
	$(PYTHON) -m features.prepare
	$(PYTHON) -m train.train --model $(MODEL)

package:
	$(PYTHON) -m serve.package --model $(MODEL) --version $(VERSION)

package-all:
	@for model in $$($(PYTHON) -c "from features.prepare import MODELS; print(' '.join(MODELS))"); do \
		echo "==> packaging $$model"; \
		$(PYTHON) -m serve.package --model $$model --version $(VERSION); \
	done

sanity:
	$(PYTHON) -m serve.sanity --model $(MODEL)

smoke-lambda:
	$(PYTHON) tests/inference_smoke.py

clean:
	rm -rf build .venv