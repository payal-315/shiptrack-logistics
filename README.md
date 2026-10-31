# ShipTrack

ShipTrack is a full-stack logistics shipment tracking system. Customers can create
shipments and see their delivery progress, drivers can update assigned deliveries,
and operations staff can manage shipments and drivers. Visitors can look up a
shipment's public tracking status without signing in.

This repository contains a React web client and a Node.js/Express API backed by
MongoDB. It is a development project, not a production-readiness certification.

## Technology

- **Backend:** Node.js, Express 5, Mongoose, MongoDB, JWT, bcryptjs
- **Frontend:** React 19, Vite, React Router, Leaflet / React Leaflet
- **External services:** Nominatim for shipment-creation geocoding; OSRM for map
  route geometry; OpenStreetMap for map tiles
- **Tests:** Jest, Supertest, MongoDB Memory Server (backend); Vitest and React
  Testing Library (frontend)

## Features

- Customer signup, login, profile, and shipment creation
- Role-specific customer, driver, and operations pages
- JWT-protected API routes and role-based authorization
- Customers see their own shipments; drivers see shipments assigned to them
- Operations staff can view shipments, assign drivers, update shipment details,
  and manage drivers
- Shipment status and location changes create tracking events
- Public tracking shows shipment status, route progress, map, and event history
  without exposing customer or driver contact information
- Shipment origin and destination are geocoded at creation; route geometry is
  fetched from OSRM by the map and falls back to a straight line if unavailable
- Public tracking refreshes periodically and stops polling after delivery
- Driver login has a dedicated page and navigation layout
- Operations and drivers can choose stored route checkpoints; operations also has
  a custom-location option
- Public and customer tracking refreshes every five seconds, animates the vehicle
  marker, and updates the event history without a page refresh

## Requirements

- Node.js 20.19 or newer and npm
- MongoDB running locally or a MongoDB connection URI
- Internet access for Nominatim geocoding, OSRM route geometry, and OpenStreetMap
  tiles (the rest of the app does not host these services)

## Setup and run

### 1. Configure MongoDB and backend environment

Start MongoDB locally, or prepare a MongoDB URI for a database you can use.
Create `backend/.env` locally; environment files are intentionally excluded from
Git. Set at least `MONGO_URI` and a long, random `JWT_SECRET`:

```powershell
Set-Location backend
@'
MONGO_URI=your-mongodb-connection-string
MONGO_DB_NAME=logisticsDB
JWT_SECRET=replace-with-a-long-random-secret
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
'@ | Set-Content .env
```

Backend environment variables:

| Variable | Purpose |
|---|---|
| `PORT` | Backend HTTP port; defaults to `5000` |
| `NODE_ENV` | Conventional runtime environment setting |
| `MONGO_URI` | MongoDB connection URI; defaults to local MongoDB |
| `MONGO_DB_NAME` | Database name; defaults to `logisticsDB` |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `CORS_ORIGIN` | Allowed frontend origin; defaults to `http://localhost:5173` |
| `DRIVER_ORIGIN_RADIUS_KM` | Maximum pickup distance for a driver without an active route |
| `DRIVER_LOCATION_MAX_AGE_MINUTES` | Location freshness window for assignment |
| `DRIVER_MAX_LOCATION_ACCURACY_METERS` | Maximum location accuracy accepted as precise |
| `ETA_MIN_DAYS`, `ETA_KM_PER_DAY` | ETA calculation settings |
| `ETA_UNASSIGNED_BUFFER_DAYS` | Handling time included while a shipment is unassigned |
| `DELAY_THRESHOLD_HOURS` | ETA movement required before marking a shipment delayed |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional email delivery for password reset codes; required for that feature in production |

### 2. Install backend dependencies

```powershell
npm install
```

Customers and drivers can register through the application. Operations accounts
must be provisioned directly in the database by a trusted administrator; this
repository does not include a seed or operations-bootstrap utility.

### 3. Configure and install the frontend

In a separate terminal, create `frontend/.env` locally and install dependencies:

```powershell
Set-Location frontend
@'
VITE_API_BASE_URL=http://localhost:5000/api
'@ | Set-Content .env
npm install
```

`VITE_API_BASE_URL` defaults to `http://localhost:5000/api`; change it if the
backend uses another address.

### 4. Start the applications

Run each process in its own terminal:

```powershell
# Terminal 1
Set-Location backend
npm run dev
```

```powershell
# Terminal 2
Set-Location frontend
npm run dev
```

Open the frontend URL printed by Vite (normally `http://localhost:5173`). The
backend health response is at `http://localhost:5000/`; API routes are under
`http://localhost:5000/api`.
Driver accounts can sign in at `/driver-login`; customers use `/`, and operations
staff use `/operations-login`.
Drivers can submit an application at `/driver-signup`. Operations must approve
an application before the driver becomes available for shipment assignment.

### Password reset email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in the
local backend environment to enable customer and driver reset emails. In
development only, if SMTP is not configured, the OTP is printed to the backend
console. Production never logs reset codes, so SMTP must be configured there.

## API endpoints

All responses use JSON. Authenticated requests require
`Authorization: Bearer <token>`. Customer, driver, and operations shipment
visibility is role-scoped by the API.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a customer |
| `POST` | `/api/auth/login` | Public | Log in and receive a JWT |
| `GET` | `/api/auth/me` | Authenticated | Get the current user's profile |
| `POST` | `/api/auth/forgot-password` | Public | Request a role-scoped customer or driver OTP |
| `POST` | `/api/auth/verify-otp` | Public | Verify the 6-digit reset code |
| `POST` | `/api/auth/reset-password` | Public | Set a new password with a one-use reset token |
| `POST` | `/api/shipments` | Customer, operations | Create a shipment |
| `GET` | `/api/shipments` | Authenticated | List shipments visible to the role |
| `GET` | `/api/shipments/:id` | Authenticated | Get a visible shipment by ID or tracking identifier |
| `GET` | `/api/shipments/:id/checkpoints` | Shipment owner, assigned driver, or operations | Generate once and retrieve the route's stored checkpoints |
| `PUT` | `/api/shipments/:id` | Operations | Update shipment fields, including coordinates |
| `PUT` | `/api/shipments/:id/assign` | Operations | Assign a driver |
| `DELETE` | `/api/shipments/:id` | Operations | Delete a shipment |
| `GET` | `/api/tracking/public/:trackingNumber` | Public; 120 requests/minute/IP | Get safe public tracking details and event history |
| `GET` | `/api/tracking/:trackingNumber` | Authenticated, shipment access required | Get tracking details |
| `GET` | `/api/tracking/:trackingNumber/events` | Authenticated, shipment access required | Get tracking events, newest first |
| `PUT` | `/api/tracking/:trackingNumber/status` | Assigned driver or operations | Update status/location and record a tracking event when changed |
| `POST` | `/api/drivers` | Operations | Create a driver |
| `POST` | `/api/drivers/signup` | Public | Submit a pending driver application |
| `GET` | `/api/drivers/pending` | Operations | List driver applications awaiting review |
| `POST` | `/api/drivers/:id/approve` | Operations | Approve a pending driver |
| `POST` | `/api/drivers/:id/reject` | Operations | Reject a pending driver |
| `GET` | `/api/drivers` | Operations | List drivers |
| `GET` | `/api/drivers/:id` | Operations | Get a driver |
| `PUT` | `/api/drivers/:id` | Operations | Update a driver |
| `DELETE` | `/api/drivers/:id` | Operations | Delete a driver |

The public tracking response is intentionally limited to the tracking number,
status, origin/destination and their coordinates, current location coordinates,
estimated delivery, and event status/timestamps/location coordinates. It omits
customer and driver contact details and internal record IDs.

## Tests and build

Run backend tests (they start an isolated in-memory MongoDB):

```powershell
Set-Location backend
npm test
npm run lint
npm run build
```

Run frontend tests, lint, and production build:

```powershell
Set-Location frontend
npm test -- --maxWorkers=1
npm run lint
npm run build
```

The backend `build` command performs Node syntax checks (the API runs directly
on Node and does not need a bundling step). The first backend test run may
download the MongoDB Memory Server binary.

## Known limitations

- Nominatim, OSRM, and OpenStreetMap are external services; availability, network
  access, and their usage policies affect geocoding and map display.
- Tracking uses five-second HTTP polling rather than a live push connection; the
  page clears its interval when delivery is reported.
- Authentication tokens are stored in browser `localStorage`; this is convenient
  for this project but requires careful XSS protections in a deployed application.
- Operations accounts need trusted manual provisioning because no seed utility
  or default operations credentials are included.
- Automated tests cover selected API and UI behavior, not every workflow or a
  live third-party/database deployment.
- Review operational needs such as monitoring, backups, deployment hardening,
  and production secrets management before deploying.
