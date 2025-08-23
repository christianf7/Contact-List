# Contact List

Simple contact capture service with a minimal web UI.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and adjust values:

   - `API_KEY` – key required for the REST API.
   - `ADMIN_PASSWORD` – password for the basic‑auth protected UI (username is `admin`).
   - `PORT` – optional port for the HTTP server.
   - `WEBHOOK_URL` – optional URL to receive POST notifications when contacts are added.

3. Start the server:

   ```bash
   npm start
   ```

## Usage

- **API** – `POST /api/contacts` with JSON body `{ email, firstName }` and header `x-api-key: <API_KEY>`.
- **Web UI** – visit `/contacts` in a browser and sign in with basic auth. From here you can:
  - Add a single contact (name, email, optional date).
  - Upload a CSV file (`firstName,email,createdAt`) to bulk import contacts.
  - Download all contacts as CSV.

Contacts are stored locally using [nedb-promises](https://github.com/bajankristof/nedb-promises).

