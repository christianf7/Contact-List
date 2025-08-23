# Contact List

Simple contact capture service with a minimal web UI and basic user management.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and adjust values:

   - `API_KEY` – key required for the REST API.
   - `ADMIN_USERNAME` – username for the default admin user.
   - `ADMIN_PASSWORD` – password for the default admin user.
   - `PORT` – optional port for the HTTP server.
   - `WEBHOOK_URL` – optional URL to receive POST notifications when contacts are added.

3. Start the server:

   ```bash
   npm start
   ```

## Usage

- **API** – `POST /api/contacts` with JSON body `{ email, firstName }` and header `x-api-key: <API_KEY>`.
- **Web UI** – visit `/login` to sign in. After logging in you can:
  - View total contacts and a chart of daily contacts for the last month.
  - Add a single contact (name, email, optional date).
  - Upload a CSV file (`firstName,email,createdAt`) to bulk import contacts.
  - Download all contacts as CSV.
  - Administrators can manage users at `/users`.

Contacts are stored locally using [nedb-promises](https://github.com/bajankristof/nedb-promises).

