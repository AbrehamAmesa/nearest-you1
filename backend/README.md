# Nearest You — Java 21 + Spring Boot 3.3 Backend

Modular monolith backend for the **Nearest You** location-based multi-service super app.

## Architecture Highlights
- **Entity-First Schema (`ddl-auto: update`)**: All 17 PostgreSQL tables are automatically created and evolved by Hibernate from JPA `@Entity` classes under `com.nearestyou.entity`. Zero SQL migration scripts are used.
- **Zero Mock Data**: `ReferenceDataInitializer` only ensures system categories, category document requirements, pricing policy defaults, and protected Super Admin records exist when the database is empty.
- **Role-Based Access Control (RBAC) & Ownership Guards**:
  - Roles: `CUSTOMER`, `BUSINESS_OWNER`, `DELIVERY_PARTNER`, `ADMIN`, `SUPER_ADMIN`
  - Every provider self-registers with Fayda ID, biometric liveness check, Admin-mapped documents, and real-time GPS coordinates.
  - Strict business ownership verification before creating listings, toggling availability, updating order/booking/application statuses, and scoped workspace/dispatch queries.
  - Self-suspension and primary Super Admin demotion protections.

## Running Locally
1. Create an empty PostgreSQL database (no SQL tables needed — Hibernate creates them automatically):
   ```bash
   createdb nearestyou
   ```
2. Set environment variables (or use defaults in `application.yml`):
   ```bash
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_NAME=nearestyou
   export DB_USER=postgres
   export DB_PASSWORD=postgres
   # Optional for local API testing without Firebase ID tokens:
   export ALLOW_DEV_AUTH=true
   # Or provide Firebase service account JSON for real Google Auth token verification:
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
   ```
3. Run the application:
   ```bash
   cd backend
   mvn spring-boot:run
   ```
4. Open Swagger API docs at `http://localhost:8080/swagger-ui.html`.

### Local Dev Header Testing (`ALLOW_DEV_AUTH=true`)
When testing locally without Firebase tokens, pass:
- `X-Dev-User-Uid: local-admin`
- `X-Dev-User-Email: abrehamamesw@gmail.com`
- `X-Dev-User-Name: Platform Admin`


### Firebase Admin SDK (required for Google sign-in)
The browser Firebase configuration does not authenticate tokens on the server. The backend must also have a Firebase Admin service account from the same Firebase project. On Windows PowerShell, set:
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\nearest-you-firebase-adminsdk.json"
mvn spring-boot:run
```
Do not put the service-account JSON inside the frontend's `public` directory or commit it. If the backend starts without this setting, its startup log explicitly reports that Firebase Admin is not initialized and authenticated API calls will return HTTP 401.
