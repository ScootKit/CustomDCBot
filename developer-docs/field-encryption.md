# Field-level encryption (secure storage)

As part of our ongoing security and privacy work, the bot has an additional layer of protection for
the most sensitive user data: field-level encryption. Selected database columns are encrypted at the
application level, so sensitive fields stay protected even when someone has direct database access
(for example, a technician reviewing a database for support or debugging). It is an extra safeguard
layered on top of the broader security posture.

## What it means for the open-source build

In this repository the feature ships as a thin serialization wrapper with a passthrough crypto stub:

- Self-hosted instances and the test suite run with no key and no configuration. Nothing to set up.
- The registered columns are declared `TEXT`. The hooks serialize their JSON and integer values into
  that text on write and parse them back on read, so your model code keeps working with plain objects
  and numbers.
- The actual encryption is injected only on the managed backend. You never need a key locally, and the
  encryption is a safe no-op here.

The wrapper lives in `src/functions/secure-storage/`:

- `fields.js` lists every protected column (the source of truth for what is secured).
- `hooks.js` registers the serialization hooks on each model.
- `fieldCrypto.js` is the passthrough stub the managed backend replaces.

## Contributor rules

If you write or change a module:

- **Keep `TEXT` columns as `TEXT`.** The hooks serialize JSON and integers into them; changing the
  type breaks reads and writes.
- **Adding a sensitive free-text or PII field?** Declare it `TEXT` and register it in
  `src/functions/secure-storage/fields.js` with its type (`string`, `json`, or `int`). Serialization
  then happens automatically and the encryption is a safe no-op locally.
- **Do not register columns used in `WHERE`, `ORDER`, indexes, unique constraints, or aggregates.**
  Encrypting those would break lookups. IDs, foreign keys, enums, booleans, counters, timestamps, and
  external resource references stay as they are.
- **You never need a key.** Encryption activates only on the managed backend.

We update the existing fields of community modules when this requirement changes, so you normally do
not have to touch anything unless you are adding a new sensitive field.
