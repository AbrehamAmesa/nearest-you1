# Nearest You — Booking Payments (Chapa + Payo)

This project uses the existing `PaymentTransaction` ledger and booking lifecycle. Payment is never considered successful because a customer returned to the app or typed a receipt number. A booking is confirmed only after the backend verifies the provider's payment notification/API response.

## Provider setup

### Chapa

1. Create/sign in to a Chapa merchant account: https://dashboard.chapa.co/
2. Start with TEST mode and copy the TEST secret key.
3. In Chapa dashboard webhook settings, register:
   `https://YOUR_API_HOST/api/v1/payments/chapa/webhook`
4. Configure a strong webhook secret hash in Chapa and copy the same value to `CHAPA_WEBHOOK_SECRET`.
5. The backend supplies the callback URL automatically:
   `https://YOUR_API_HOST/api/v1/payments/chapa/callback`
6. Chapa's hosted checkout return URL points to `PUBLIC_APP_BASE_URL` with `paymentTxRef` query parameter. The frontend asks the backend to verify the transaction after return.

### Payo

1. Create a project at https://dashboard.payment.et/ and copy its project API key.
2. Register the webhook URL in the Payo project:
   `https://YOUR_API_HOST/api/v1/payments/payo/webhook`
3. The backend creates orders at `POST https://api.pygate.et/v1/orders` with the `x-api-key` header and `callbackUrl`.
4. Payo signs the webhook body with HMAC-SHA256 using the project API key. The backend verifies `x-pygate-signature` against the raw request body.
5. Payo's hosted page collects the bank transfer and receipt. The signed `APPROVED` webhook is the source of truth. Customer-entered receipt references do not mark payments as paid.

Payo currently describes its service as an open beta with no setup, monthly, or per-transaction fees. Check the provider's dashboard/terms for current eligibility and pricing before production use.

## Backend environment variables

Set these in the backend's hosting environment (Render Environment, not the React `.env`):

```properties
PUBLIC_APP_BASE_URL=https://YOUR_FRONTEND_HOST
PUBLIC_API_BASE_URL=https://YOUR_API_HOST

CHAPA_BASE_URL=https://api.chapa.co/v1
CHAPA_SECRET_KEY=CHASECK_TEST_...
CHAPA_WEBHOOK_SECRET=YOUR_CHAPA_WEBHOOK_SECRET_HASH

PAYO_BASE_URL=https://api.pygate.et/v1
PAYO_API_KEY=pgk_...

PAYMENTS_ALLOW_SANDBOX_COMPLETION=false
```

- Use TEST credentials first. Replace with LIVE credentials only after end-to-end testing and merchant approval.
- `PUBLIC_API_BASE_URL` must be the public backend origin, not the frontend URL.
- `PUBLIC_APP_BASE_URL` must be the public React app origin.
- Keep all gateway keys on the backend. Never add them to `VITE_*` variables, React config files, Git, or browser storage.
- `PAYMENTS_ALLOW_SANDBOX_COMPLETION` must remain `false` in production. It is an optional local-only switch for the built-in Chapa sandbox demonstration when no Chapa test key exists; it is not a real payment.
- Payo webhook signatures are checked using `PAYO_API_KEY`, as described by Payo's published integration instructions.

## Payment flow

1. Customer creates a booking. Gateway bookings start as `PENDING_PAYMENT` (quote-based bookings remain `PENDING` until the quote is accepted).
2. The backend calculates the payable amount from the saved booking and creates/reuses a single active payment transaction for that booking.
3. Chapa: backend initializes hosted checkout; customer pays; backend verifies status, transaction reference, ETB currency and exact amount before marking the transaction `PAID`.
4. Payo: backend creates a hosted bank-transfer order; customer transfers and uploads the receipt on Payo; backend waits for a valid signed `APPROVED` webhook and checks `orderId`, amount and currency.
5. The payment transaction is marked paid idempotently, the booking payment status becomes `SUCCESSFUL`, and a quote-approved booking moves to `CONFIRMED`.
6. Payo collections are received into the merchant's configured account. Provider payout is tracked separately as `PENDING_PROVIDER_PAYOUT`; Payo does not provide the dual-account split represented by Chapa subaccounts.

## Local validation

Backend:

```bash
cd backend
mvn clean test
mvn clean package
```

Frontend:

```bash
cd frontend
npm ci
npm run build
```

Then test with provider TEST credentials:

- Initialize a booking with each gateway.
- Verify the correct amount and ETB currency appear at the hosted checkout.
- Complete a successful test payment and confirm the booking becomes `CONFIRMED` only after server verification/webhook.
- Send an invalid webhook signature and confirm it is rejected.
- Send a valid but wrong-amount/wrong-currency webhook and confirm it is rejected.
- Replay the same successful webhook and confirm the booking and ledger are not processed twice.
- Submit a Payo receipt reference without paying and confirm the booking remains unpaid.
- Attempt to manually confirm an unpaid gateway booking as the provider and confirm the API rejects it.

## Important operational notes

- Database schema is managed by the project's existing Hibernate `ddl-auto: update` setting; `payment_transactions` is created/updated on startup.
- A payment reference is unique. Active payment transactions are reused for the same gateway; switching gateways while another transaction is pending is blocked to avoid duplicate charges.
- The backend must be reachable over HTTPS by both providers for webhook delivery.
- A successful payment does not itself transfer money to a provider's bank account. Provider settlement/payout must be reconciled separately, especially for Payo.
- The repository archive did not include merchant credentials, so live provider activation and real-money tests require your own Chapa/Payo accounts and keys.
