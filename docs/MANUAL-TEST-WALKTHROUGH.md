# Manual test walkthrough (P4 to P9)

How to use this: follow the parts in order. Each step says **who** does it, **where**, **what to do** and **what you should see**. If what you see differs, write down the step number, what you saw, and a screenshot, and send it to me; fixes go in as new migrations or code changes.

Time needed: about 2 to 3 hours for everything. Parts A to D are the core flow (about 90 minutes). The rest can be done in any order after that.

## Part 0. Setup

### Accounts you need (create them once)
In the Supabase dashboard (project `semtmllmwhxznxechfsk`) go to Authentication, Users, Add user, tick "Auto confirm user". Use easy test addresses:

| Name | Role | Purpose |
|---|---|---|
| `owner-a@...` | customer owner of Organization A | the main customer |
| `member-a@...` | customer member of Organization A | checks owner-only rules |
| `owner-b@...` | customer owner of Organization B | checks tenant isolation |
| `owner-r@...` | customer owner of Organization R | the referrer (commissions) |
| staff accounts | admin, finance, operations, support | you may already have the first admin; add the others on the Staff page |

Notes:
- A staff account must not also be an organization member.
- Every staff account must enrol an authenticator app the first time it signs in. A "fresh code" is a new 6-digit code from that app. When a page says **Verify now**, click it and enter a new code; then repeat the action.
- The Staff page (`/admin/staff`, admin only) adds a staff member from an existing confirmed account. Give your own test staff accounts the roles: one `operations`, one `finance`, one `support` (and your admin).
- **Each new staff member needs three things before staff pages work** (until then `/admin` shows "Access restricted"):
  1. **You (admin)** add them on `/admin/staff` with their role (fresh code).
  2. **You (admin)** press **Open authenticator setup window** on their row (fresh code). The page shows an **authorization code** once: copy it and send it to the staff member. It is valid for 30 minutes and works for that person only. **Do this BEFORE they sign in or scan any QR code**: an authenticator created before the window opened can never be approved (the sign-in screen then offers "Remove it and start over").
  3. **The staff member** signs in, sets up the authenticator (scan the QR code with an authenticator app, enter the first 6-digit code) and pastes the authorization code into the **Authorization code** field. After that, staff pages open. If the 30 minutes pass, press the button again.
  Do this for `staff-ops`, `staff-finance` and `staff-support`. (Customers do not need any of this.)
- Use two browsers (or one normal and one private window) so a customer and a staff member can be signed in at the same time.

### Organizations (admin)
1. Sign in as admin, open **Applications** (`/admin/applications`).
2. Enter an application for "Test Lab A" (company, contact name, contact e-mail = owner-a's address). Approve it with the organization code `TEST-A`.
   - Expect: Organization A is created on prepay terms, and `owner-a` is added as its owner automatically because the account exists.
3. Repeat for "Test Lab B" (code `TEST-B`, owner-b) and "Referrer R" (code `TEST-R`, owner-r).
4. Open **Organizations** and check all three are listed as active.
5. On Organization A's page, add `member-a` as a **member** (not owner).
   - Expect: it appears in the members list; the last owner can't be removed (try it, you should see a refusal).

### Catalog (admin, once)
1. **Products** (`/admin/products`): make sure at least one product has a variant with both a base price and a minimum price (for example base $100.00, minimum $80.00).
2. **Catalogs & Pricing** (`/admin/pricing`): assign that product to Organizations A, B and R.

## Part A. Customer onboarding to go-live (Organization A)

This is the "fulfillment service" setup. There are nine steps; each customer step is submitted by the customer and reviewed by staff.

**Customer = owner-a, page `/client/fulfillment/setup`. Staff = operations unless noted, page `/admin/fulfillment`.**

| # | Who | Do | Expect |
|---|---|---|---|
| A1 | Customer | Step 1: add a product ("Your SKU" `TEST-001`, source: catalog or own product, units per pack 1). Then submit step 1. | Product shows "draft", then "submitted" after submitting. Editing is locked once submitted. |
| A2 | Staff (ops) | Open Organization A in `/admin/fulfillment/[org]`. Approve the product, then approve step 1. | Step 1 turns approved. Approving the step before the product fails with "not ready". |
| A3 | Admin | `/admin/fulfillment/gates`: record gate **G2** (any note). Needs a fresh code. | G2 shows recorded. |
| A4 | Customer | Step 2: upload a label artwork (PDF, PNG or JPEG under 10 MB), choose a template, submit step 2. | File appears; status submitted. Try a `.exe` or `.html` renamed to `.pdf`: it must be refused. |
| A5 | Staff (ops) | Approve the label, then approve step 2. | Without G2 recorded it must refuse with "gate required" (try it before A3 if you want to see this). |
| A6 | Customer | Step 3: choose the packaging option, submit. Staff approve. | Approved. |
| A7 | Customer | Step 4: store connection, method "api", store URL `https://example.com`, submit. Staff **reject** it with a reason, then the customer fixes it and resubmits, staff approve. | The reject reason shows to the customer; resubmitting works. An `http://` URL must be refused. |
| A8 | Customer | Step 5 (test order): go to **API Keys** and create a **test** key (copy it now: it is shown once). Send a sandbox order (see Part C, step C1 but with the test key). Then submit step 5. Staff approve. | Step 5 says "not ready" until a sandbox order exists. |
| A9 | Staff (ops) | Step 6: upload an agreement file for the organization and offer it. Customer signs (name and title). | Customer sees the agreement and the sign form. Signing twice is refused. |
| A10 | Staff (finance) | Create the setup and funding invoices for A, for example setup $1,000 and funding $500. Needs a fresh code. | Both appear under the customer's **Invoices & Payments**. |
| A11 | Customer | Report payment on both invoices (see Part B, B3 for how). Finance confirms both. | Step 6 can only be approved after the setup invoice is paid ("setup unpaid" before). |
| A12 | Customer + Staff | Step 7: customer acknowledges the funding; staff approve (refused while the funding invoice is unpaid). | Approved once funded. |
| A13 | Customer + Staff | Step 8 (launch review): fill contacts, escalation, return address and tick the three confirmations. Staff approve. | Incomplete data is refused. |
| A14 | Admin | Record gates **G1, G4, G5, G6** (fresh code each time), then press go-live for A. | Go-live is refused until every required gate is recorded and every step approved. Afterwards Organization A shows live; the customer can now create a **live** API key. |

Also check: operations cannot press go-live or record gates (admin only); a customer from Organization B cannot open A's setup page data.

## Part B. Buying wholesale products and paying (any organization)

1. **Customer (owner-b)**: **Shop**, add the product to the cart, check out with a shipping address.
   - Expect: an order appears under **Orders** and an invoice (status open) under **Invoices & Payments**. The price is the price you set.
2. Open the invoice. Expect the payment instructions text (set in Part H, step H5) and the footer.
3. **Customer owner**: report a payment on the invoice (method, amount, reference).
   - Expect: status "reported". A member (not owner) must not be able to report payments.
4. **Staff (finance)**: `/admin/invoices/payments`: confirm the payment for the exact amount (fresh code). Try confirming a wrong amount: it must be refused.
   - Expect: the invoice becomes **Paid**. Rejecting a payment instead (with a reason) leaves the invoice open.
5. **Customer**: open **Billing**: the statement shows the payment; the fee schedule appears once you add fees (Part H).

## Part C. API orders, stock and shipping (Organization A, live)

Use a terminal. Replace `HOST` with your portal address and `KEY` with a live key created by owner-a under **API Keys**.

**C1. Send an order**
```
curl -X POST https://HOST/api/v1/orders \
  -H "Authorization: Bearer KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-order-0001" \
  -d '{"external_ref":"ORD-1001","recipient":{"name":"Dr A","line1":"1 Lab Way","city":"Austin","region":"TX","postal":"78701","country":"US"},"lines":[{"sku":"TEST-001","quantity":2}]}'
```
- Expect: HTTP 201 with the order (status `pending`). Send the exact same command again: HTTP 200/201 with the same order and a "replay" marker, and no second order.
- Change the body but keep the same Idempotency-Key: expect a conflict error.
- Use an unknown SKU: expect an "unknown SKU" error listing it.
- Use a wrong key: expect 401 with no hint whether the key exists.
- A **test** key creates **sandbox** orders; staff can never process those.
- `GET https://HOST/api/v1/orders/ORD-1001` returns your order.

**C2. Warehouse setup (admin, once)**: `/admin/inventory`: create warehouse `WH1` and a storage location `A-01`. Operations cannot create warehouses (admin only).

**C3. Customer announces stock**: owner-a, **Inventory** (`/client/stock`): announce an inbound shipment (reference `PO-1`, product TEST-001, 100 units). A member cannot do this.
- Expect: it shows "expected". Stock still reads 0 available.

**C4. Staff receives it**: operations, `/admin/inventory`, open the shipment, enter units 100, lot `LOT1`, an expiry date and the location, and receive.
- Expect: the customer's Inventory page now shows 100 on hand and 100 available, with the lot and its expiry.

**C5. Move the order through fulfillment (operations)**: `/admin/fulfillment/orders`, open ORD-1001:
- queued, then allocated: expect 2 units reserved (98 available).
- picked, packed, ready, then shipped: shipping asks for carrier and tracking number; without them it refuses.
- Expect after shipping: stock is 98 on hand and 0 reserved; the customer sees tracking on **Fulfillment orders** (`/client/fulfillment/orders`).
- A shipped order cannot move back. Support cannot move orders at all.

**C6. Over-allocation**: send a second order for 500 units, queue it, then try to allocate.
- Expect: refused, an "insufficient stock" exception opens, and no stock is reserved. Cancel it with a reason (a reason is required).

**C7. Adjust stock (operations)**: reduce LOT1 by 1 with a reason (fresh code needed).
- Expect: stock drops by 1; the movement ledger shows it. Try removing more than what is on hand or what is reserved: refused.

**C8. Webhooks (optional)**: owner-a, API Keys page: add an endpoint (a public `https://` URL, for example from webhook.site) and send the test event. Private or `http://` URLs must be refused. Deliveries only go out when the worker runs: an admin creates the worker credential under **Integrations** (fresh code), and a scheduler calls `/api/cron/webhooks` with `Authorization: Bearer $CRON_SECRET` (needs the env vars `CRON_SECRET` and `INTEGRATION_WORKER_TOKEN`). If you do not run the worker, deliveries stay "pending": that is expected.

## Part D. Commissions (referral program)

**Staff = finance (fresh code needed for every change). Customer = owner-r.**

| # | Who | Do | Expect |
|---|---|---|---|
| D1 | Finance | `/admin/commissions`: create plan "Standard 5%" (rate 5, hold 14 days). Create a second plan "No hold" (rate 5, hold 0). | Plans listed. A rate above 50 is refused; duplicate code refused. |
| D2 | Finance | Enrol Organization R on the "No hold" plan. | R gets an 8-character referral code. Enrolling twice is refused. |
| D3 | Finance | Link Organization A as referred by R's code (type the code in lower case: it still works). | Link shows active. Linking A again to another code is refused; R cannot refer itself. |
| D4 | You | Make sure Organization A has a **paid order invoice** (Part B with owner-a, 3 x $100 = $300). | Invoice paid. |
| D5 | Finance | Press **Accrue from paid invoices**. | One commission entry: 5% of the wholesale amount ($15.00 for $300). Pressing again adds nothing. |
| D6 | Customer (owner-r) | `/client/commissions`. | Code, plan, **$15.00 available**, nothing pending, and a statement line "Commission earned from Referral 1". It must **not** show Organization A's name or invoice. A member of R sees an "owners only" message. |
| D7 | Finance | Record a payout of $10.00 (method, date, reference; fresh code). | Recorded; R now shows $5.00 available and $10.00 paid out. |
| D8 | Finance | Try a payout of $5.01. Then try again with the same amounts. | $5.01 is refused ("more than the available balance"). |
| D9 | Finance | Add an adjustment of -2.00 with a reason. | Available drops to $3.00; the statement shows the adjustment and its reason. |
| D10 | Finance | End the A to R link, then buy and pay another invoice for A and accrue. | No new commission is earned after the link ended. |

To see the **14-day hold**, enrol another organization on the "Standard 5%" plan, link a paying customer and accrue: the commission shows as **pending** with a "payable from" date 14 days away, and a payout is refused until then.

## Part E. Certificates of analysis

1. **Operations**: `/admin/inventory/certificates`: choose Organization A, then publish a certificate (title, optional date, pick lot `LOT1` and/or the shipped order, upload a PDF).
   - Expect: it appears in the list as Published. Uploading a non-PDF/PNG/JPEG file is refused. Publishing without choosing a lot or order is refused.
2. **Customer (owner-a or member-a)**: `/client/certificates`.
   - Expect: the certificate is listed with the lot and order; **Download** opens the file (the link works for about 5 minutes).
3. **Customer (owner-b)**: `/client/certificates` for B must show nothing from A.
4. **Operations**: withdraw the certificate with a reason (fresh code).
   - Expect: the customer still sees it but as **Withdrawn**, with no download.
5. A second publish of the same file, or attaching a certificate to another organization's lot, must be refused.

## Part F. Notifications (e-mail outbox)

No provider is connected, so nothing is actually sent. You are testing the **queue**.

1. **Admin or support**: `/admin/notifications`.
   - Expect: a banner "No e-mail provider connected".
2. **Finance**: press **Scan for new events**.
   - Expect: queued messages appear for invoices issued, payments reviewed and shipped orders from the last 14 days, one per organization **owner** (never to plain members). Press it again: no duplicates.
3. Publishing a certificate (Part E) and recording a payout (Part D) each queue a message for the relevant owners.
4. **Customer (owner-a)**: `/client/account`, E-mail notifications: turn off "Shipping updates". Invoice and payment e-mails have no switch.
5. **Admin**: press **Send queued messages**.
   - Expect: a message that nothing was sent because no provider is connected; messages stay queued.
6. **Admin**: edit a template (fresh code). Use an unknown placeholder such as `{{password}}`: refused. Only the listed placeholders work.

## Part G. Reports

`/admin/reports`:
- **Finance or admin**: run Sales (pick a period), Receivables aging, Inventory, Commissions. Check a few numbers by hand against what you did in Parts B to D (for example the sales total for A, and commissions accrued, paid out and available for R).
- **Download CSV** and open it in a spreadsheet: text that starts with `=`, `+`, `-` or `@` shows with a leading apostrophe on purpose (spreadsheet formula protection).
- **Operations** can run only the Inventory report; Sales/Receivables/Commissions must be refused. **Support** cannot run billing reports.
- A period longer than 366 days or with the start after the end must be refused.
- Every run appears in the audit log (Part H).

## Part H. Admin operations

| # | Who | Do | Expect |
|---|---|---|---|
| H1 | Admin | `/admin` dashboard. | Finance staff see money figures (invoiced, collected, outstanding, overdue, aging, top balances); **operations staff must not see money**. Counts for orders, fulfillment, applications look right. |
| H2 | Admin | Organization B: suspend it with a reason (fresh code). | owner-b is immediately locked out of its data. Reactivate: access returns. |
| H3 | Admin | Try to close Organization A while it has unpaid invoices or open fulfillment orders. | Refused ("still has unpaid invoices or open orders"). |
| H4 | Admin | Set payment terms to net 30 for B. | Applies only to invoices created afterwards. `net999` is refused. |
| H5 | Admin | `/admin/settings`: set **Payment instructions** (for example "Zelle: pay@yourcompany.com") and an invoice footer. | Customers see it on every invoice under "How to pay". |
| H6 | Finance | Settings: add a fee (code `per_order`, $5.00 per order, start today). Add the same code again with a later start date. | The old price ends the day before; history stays visible. Customers see the current fee on **Billing**. |
| H7 | Support | `/admin/customers`. | E-mail and name visible, phone hidden (only the full-profile permission sees phone). |
| H8 | Admin | `/admin/audit`: filter by `staff.commission.` or `staff.report.`. | Every action you did appears, including denied attempts. Filters with symbols like `%` are refused. |
| H9 | Customer | `/client/account`: edit your name and phone. | Saved; only your own profile changes. |

## Part I. Permission spot checks

Quick checks that the walls hold. Each should be refused or hidden:
1. Sign in as owner-b and try to open owner-a's pages by changing the organization in the address bar: you only ever see your own organization.
2. Sign out and open an `/admin` or `/client` page: you are sent to sign in.
3. Sign in as a customer and open `/admin`: access is refused.
4. Sign in as support: the nav hides Commissions, and Inventory/Integrations are not offered; money pages are refused if you type the address.
5. Any step that says "fresh code" must refuse (with a **Verify now** link) if your last authenticator code is older than about 15 minutes.

## Part J. Things that are NOT expected to work yet

Do not report these as bugs; they are known and in the P10 backlog:
- No e-mail is ever sent (no provider).
- Commission accrual, the notification scan and sending are manual button presses (no scheduler).
- The webhook worker needs a scheduler and two environment variables.
- There is no public application form and no e-mail invitations for owners or staff.
- Fee schedule entries are information only: no fee invoice is generated from them.
- Uploaded files are not virus scanned.
- Anything about API rate limiting, DNS rebinding, owner MFA recovery: security work in P10.

## What to send me
For each problem: the step (for example "D8"), what you did, what you expected, what happened, and a screenshot. A page error shows a short message only; if you can, also note the time so I can look in the audit log.
