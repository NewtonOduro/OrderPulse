# Database models

OrderPulse uses parameterized SQL through its database adapter rather than an ORM. The relational tables are the persistence models; there are no JavaScript ORM model classes to maintain.

| Table | Purpose |
| --- | --- |
| `users` | Customer, staff, and manager identities, password hashes, account state, and email-verification state. |
| `sessions` | Hashed session-token records with expiry, related to `users`. |
| `email_auth_tokens` | Hashed, single-use verification and password-reset tokens, related to `users`. |
| `menu_items` | Menu descriptions, category placement, pesewa prices, availability, and optional inventory counts. |
| `orders` | Customer checkout, payment reference/state, order state, pesewa total, account/table, delivery details, offer discount, and loyalty redemption. |
| `order_items` | Snapshot of ordered item name, price, and quantity; related to `orders` and `menu_items`. |
| `restaurant_tables` | Table name, seating capacity, and availability state. |
| `delivery_areas` | Manager-configured delivery neighbourhoods, flat fees in pesewas, and availability. |
| `restaurant_deals` | Manager-published discount codes, fixed pesewa discounts, and optional active dates. |
| `meal_bundles` / `meal_bundle_items` | Fixed-price bundles and their selected menu items and quantities. |
| `order_meal_bundles` | Purchased bundle snapshots, included contents, price, and quantity. |
| `customer_favorites` | Customer account links to saved menu items. |
| `bookings` | Customer reservation details, optional account/table links, and reservation state. |
| `activity_logs` | Staff/manager audit events; actor identity is retained even if its user record is removed. |
| `job_applications` | Career application data and uploaded resume bytes. |

The canonical dialect-specific column definitions are currently in the database adapters and are documented in [project-guide.md](../../docs/project-guide.md#data-model). Keep this reference aligned when schemas change.
