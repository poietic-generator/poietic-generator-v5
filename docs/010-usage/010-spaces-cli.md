# Spaces CLI

## Show help about commands

### Command

    poietic-cli help [COMMAND]

Describe available commands or one specific command.

### Options

FIXME

## Create a space

### Command

    poietic-cli spaces create [options]

Create a session space.

### Options

* `-a, --close-after DATETIME` : Automatically close session after DATETIME
* `-d, --close-duration DURATION` : Automatically close session after DURATION
* `-n, --name NAME` : Set session name to NAME

## Open a space

### Command

    poietic-cli spaces open [options]

### Options

FIXME

## Close a space

### Command

    poietic-cli spaces close [options] GROUP_ID

### Options

* `--after DATETIME` : Automatically close session after DATETIME
* `-n, --now` :  : Close session now


## Delete a space

### Command

    poietic-cli spaces delete [options] [GROUP_ID]

### Options

* `-a, --all` : Delete all (mutually exclusive with `GROUP_ID`)
* `-f, --force` : Do not ask





## Spaces List

List all spaces, session and boards within

### Command

    poietic-cli spaces list [options]

### Options

* `-a, --all` : Show all information
* `-v, --verbose` : Show sessions information, and board informations (if used twice)

## Get meta from space

### Commands

Get meta from SPACE\_ID

    poietic-cli spaces get [options] SPACE_ID

### Options

* `-d, --duration` : Get space duration
* `-n, --name` : Get space name


## Set meta in space

### Command

Set meta from SPACE\_ID

    poietic-cli spaces set [options] SPACE_ID

### Options

* `-n, --name NAME` : Set space name




## Extract a single snapshot

### Command

Dump snapshot from SPACE\_ID at OFFSET and save it in FILENAME

    poietic-cli space shapshot SPACE_ID 
    
Options

* `-o, --output FILENAME`
* `-t, --offset OFFSET`
* `--format FORMAT` : Choose output format (


## Extract a sequence of snapshots

### Command

    poietic-cli space sequence [options] SPACE_ID

Dump a sequence of snapshots in SPACE\_ID from a time range. If not time range is specified, it dumps all

### Options

* `-o, --output DIRECTORY` : Output sequence files in directory DIRECTORY
* `-f, --fps FRAMERATE` : Dump a snapshot every 1/FRAMERATE seconds (default: 1/25)
* `--start-offset OFFSET` : Start sequence at OFFSET (default: 00:00)
* `--start-time DATETIME` : Start sequence at DATETIME (mutually exclusive with --start-offset)
* `--end-offset OFFSET` : End sequence at OFFSET
* `--end-time DATETIME` : End sequence at DATETIME


## Extract a video

### Command

Create a video from a DIRECTORY with FPS (using FFMPEG) and save it in FILENAME

    poietic-cli space video DIRECTORY 

### Options

* `-f, --fps FRAMERATE` : Set framerate to FRAMERATE (integer)
* `-o, --output FILENAME` : Set output name to FILENAME (ex: foobar.mp4)


## Parameter types

### OFFSET

Expected format : `hh:mm:ss` .

### FRAMERATE

Expected format : an integer

