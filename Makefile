#!/usr/bin/make -f

## Configure this part if you wish to
DEPLOY_REPO=
DEPLOY_OPTS=

## Input directories
DOCS_DIR=docs
IMAGES_DIR=images
BUILD_DIR=_build

## Output directories
BUILD_DOCS_DIR=$(BUILD_DIR)/docs
BUILD_IMAGES_DIR=images

## Ports
DOCS_PORT=5100

## Find .uml graphs
DOCS_IMAGES_UML=$(shell find $(IMAGES_DIR) \( -name '*.uml' ! -name '_*' \))
DOCS_IMAGES_UML_SVG=$(patsubst $(IMAGES_DIR)/%.uml,$(BUILD_IMAGES_DIR)/%.uml.svg,$(DOCS_IMAGES_UML))

## Find .dot graphs
DOCS_IMAGES_DOT=$(shell find $(IMAGES_DIR) \( -name '*.dot' ! -name '_*' \))
DOCS_IMAGES_DOT_SVG=$(patsubst $(IMAGES_DIR)/%.dot,$(BUILD_IMAGES_DIR)/%.dot.svg,$(DOCS_IMAGES_DOT))

## Find .circo graphs
DOCS_IMAGES_CIRCO=$(shell find $(IMAGES_DIR) \( -name '*.circo' ! -name '_*' \))
DOCS_IMAGES_CIRCO_SVG=$(patsubst $(IMAGES_DIR)/%.circo,$(BUILD_IMAGES_DIR)/%.circo.svg,$(DOCS_IMAGES_CIRCO))

## Find .ora images
DOCS_IMAGES_ORA=$(shell find $(IMAGES_DIR) \( -name '*.ora' ! -name '_*' \))
DOCS_IMAGES_ORA_PNG=$(patsubst $(IMAGES_DIR)/%.ora,$(BUILD_IMAGES_DIR)/%.ora.png,$(DOCS_IMAGES_ORA))

## Merge all lists
DOCS_IMAGES_SVG=$(DOCS_IMAGES_DOT_SVG) $(DOCS_IMAGES_CIRCO_SVG) $(DOCS_IMAGES_UML_SVG)
DOCS_IMAGES_PNG=$(DOCS_IMAGES_ORA_PNG)

all: help

##
## Install prerequisites
##

prepare: prepare-docs ## install prerequisites

prepare-docs: ## install prerequisites for static docs site only
	pipenv install

.PHONY: prepare prepare-docs

build-images: ## build images
	@echo "Source:"
	@echo "  ora: $(DOCS_IMAGES_ORA)"
	@echo "  uml: $(DOCS_IMAGES_UML)"
	@echo "  dot: $(DOCS_IMAGES_DOT)"
	@echo "  circo: $(DOCS_IMAGES_CIRCO)"
	@echo "Built: $(DOCS_IMAGES_SVG) $(DOCS_IMAGES_PNG)"

build-images: build-images-svg build-images-png build-images-pdf

build-images-svg: $(DOCS_IMAGES_SVG) 
build-images-png: $(DOCS_IMAGES_PNG) 
# build-images-pdf: mocodo-pdf

.PHONY: build-images build-images-svg build-images-png build-images-pdf

%.ora.png: %.ora
	TMPDIR="$$(mktemp -d)" \
		&& unzip -q $< -d "$$TMPDIR" mergedimage.png \
		&& touch "$$TMPDIR/mergedimage.png" \
		&& mv "$$TMPDIR/mergedimage.png" $@

# plantuml -pipe -tsvg < $< > $$TMP
%.uml.svg: %.uml
	TMP=$$(mktemp -d) && \
	FILE=$$TMP/$$(basename $< .uml).svg && \
		pipenv run plantuml -tsvg -o $$TMP $< && \
		mv $$FILE $@ || \
		(echo "ERROR" && cat $$FILE && exit 1)

%.dot.svg: %.dot
	TMP=$$(mktemp) && \
		dot -Tsvg $< > $$TMP && \
		mv $$TMP $@ || \
		exit 1

%.circo.svg: %.circo
	TMP=$$(mktemp) && \
		circo -Tsvg $< > $$TMP && \
		mv $$TMP $@ || \
		exit 1

watch: ## run development server
	pipenv run honcho start

watch-docs-internal:
	pipenv run mkdocs serve --dev-addr 0.0.0.0:$(DOCS_PORT)

watch-images-internal:
	while inotifywait -q -e move -e modify -e create -e attrib -e delete -e moved_to -r $(IMAGES_DIR) ; do \
		sleep 2 ; \
		$(MAKE) build-images ; \
	done

watch-docs: ## run development server for static docs site
	pipenv run honcho start docs toc

serve: watch
serve-docs: watch-docs

.PHONY: watch watch-docs watch-docs-internal serve serve-docs

##
## Build final documents 
##
## docs   => static web site
##

build: build-docs ## build all documents

build-docs: build-images ## build static docs site only
	mkdir -p $(BUILD_DOCS_DIR)
	pipenv run mkdocs build \
		--site-dir $(BUILD_DOCS_DIR)

.PHONY: build

deploy-docs: ## deploy static docs site to github
	git push $(DEPLOY_REPO)
	pipenv run mkdocs gh-deploy $(DEPLOY_OPTS)

help: ## print this help
	@echo "Usage: make <target>"
	@echo ""
	@echo "With one of following targets:"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} \
	  /^[a-zA-Z_-]+:.*?## / \
	  { sub("\\\\n",sprintf("\n%22c"," "), $$2); \
		printf("\033[36m%-20s\033[0m %s\n", $$1, $$2); \
	  }' $(MAKEFILE_LIST)
	@echo ""


##
## Clean
##

clean: clean-docs # mocodo-clean # remove generated documents

clean-docs:
	rm -fr $(BUILD_DOCS_DIR) # remove generated static docs site

.PHONY: clean clean-docs

##
## Utilities
##

fixme:
	@egrep --color -rni '(fixme)' $(DOCS_DIR)

.PHONY: fixme

# -include .makefiles/mocodo.mk
