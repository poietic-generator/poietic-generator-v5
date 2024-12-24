# SPDX-License-Identifier: MIT
#
# SPDX-FileCopyrightText: 2024 Glenn Y. Rolland <glenux@glenux.net>
# Copyright © 2024 Glenn Y. Rolland <glenux@glenux.net>

PREFIX=/usr

.PHONY: all
all: build

.PHONY: prepare
prepare:
	shards install

.PHONY: build
build:
	shards build --progress --error-trace -Dpreview_mt
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

