# SPDX-License-Identifier: MIT
#
# SPDX-FileCopyrightText: 2024 Glenn Y. Rolland <glenux@glenux.net>
# Copyright © 2024 Glenn Y. Rolland <glenux@glenux.net>

PREFIX=/usr
SHARDS_BUILD_OPT=--progress --error-trace -Dpreview_mt
CR_FILES=$(wildcard src/**/*.cr src/*.cr)

.PHONY: all
all: build

.PHONY: prepare
prepare: shard.lock

.PHONY: build
build: bin/nox bin/poietic-session-manager bin/poietic-recorder
	@echo SUCCESS

.PHONY: watch
watch: 
	 watchexec --restart --delay-run 3 -c -e cr make build

.PHONY: test spec
spec: test
test:
	crystal spec --error-trace

.PHONY: format
format:
	crystal tool format

shard.lock: shard.yml
	shards install

bin/nox: shard.lock $(CR_FILES)
	shards build $(SHARDS_BUILD_OPT) $(notdir $@)

bin/poietic-session-manager: shard.lock $(CR_FILES)
	shards build $(SHARDS_BUILD_OPT) $(notdir $@)

bin/poietic-recorder: shard.lock $(CR_FILES)
	shards build $(SHARDS_BUILD_OPT) $(notdir $@)

.PHONY: run
run: bin/nox bin/poietic-session-manager bin/poietic-recorder
	./bin/nox start

.PHONY: install
install:
	install \
		-m 755 \
		bin/poietic-session-manager \
		$(PREFIX)/bin
	install \
		-m 755 \
		bin/poietic-recorder \
		$(PREFIX)/bin

.PHONY: clean
clean:
	rm -f bin/poietic-session-manager
	rm -f bin/poietic-recorder

