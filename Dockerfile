FROM python:3.8-slim
MAINTAINER Glenn ROLLAND <glenux@glenux.net>

RUN apt-get update && \
	apt-get install -y inotify-tools inotify-tools \
			plantuml graphviz librsvg2-bin make

RUN pip3 install pipenv mocodo

COPY . /app
WORKDIR /app

RUN make prepare
CMD make watch
