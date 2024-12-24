# poietic-generator-v5

## Requirements

* Crystal Language: Version 1.3.0 or higher. Installation instructions can be found at [Crystal-lang.org](https://crystal-lang.org/install/).
* SQLite3: Required by the recorder for event logging. Install via your system's package manager. For example, on Debian/Ubuntu:
    ```bash
    sudo apt-get install sqlite3 libsqlite3-dev
    ```
* Shards: Crystal's dependency manager (installed with Crystal). Ensure it is up-to-date.

## Installation

1. Clone the Repository:
    ```bash
    git clone https://github.com/your-github-user/poietic-generator-v5.git
    cd poietic-generator-v5
    ```
2. Install Dependencies:
    ```bash
    make prepare
    ```
3. Build the Project:
    ```bash
    make build
    ```

## Usage

```bash
make run
```

## Contributing

1. Fork it (<https://github.com/your-github-user/poietic-generator-api/fork>)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

## Contributors

FIXME: contributors
