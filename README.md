# VEDEM Documentation

You can read the resulting pages of VEDEM Documentation at https://boldcode.gitlab.io/veilleur-des-medias/vedem-documentation/

For contributing to this documnation, you'll find all details below.


## Prerequisites

Make sure you have python, nodejs and npm installed.

Then install pipenv package for python:

    pip install -U pipenv


## Usage

### Install dependencies

To install project dependencies, as a user, type:

    make prepare


### Watch mode

This mode allows you the result on-the-fly as you makea changes in the content.

To use watch mode, type:

    make watch

You can now watch the on-progress work at http://localhost:5100


### Build mode

This mode builds final content for delivery (website)

To use build mode:

    make build

