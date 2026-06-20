# Developer Documentation

Guides for people writing modules or contributing to the bot core.

## Module authors

Start here if you want to add a new feature as a module:

- [**Writing a module**](./writing-a-module.md) - file layout, `module.json`, lifecycle, end-to-end example.
- [**Events**](./events.md) - event handler shape, lifecycle gates (`botReadyAt`, `allowPartial`,
  `ignoreBotReadyCheck`), Discord and custom events you can listen to.
- [**Slash commands**](./commands.md) - `config` / `run` / `subcommands` / `autocomplete`, registration, options.
- [**Database models**](./database-models.md) - Sequelize `Model.init` pattern, `models-dir`, accessing models from
  events.
- [**Field-level encryption**](./field-encryption.md) - the secure-storage serialization layer: which columns are
  protected and how to register a new sensitive field.
- [**Localization**](./localization.md) - adding strings to `locales/en.json` and using `localize()`.
- [**Nickname manager**](./nickname-manager.md) - the shared service for changing member nicknames without modules
  fighting each other.

## Configuration schema

For module config files (`config.json`, `streamers.json`, etc.):

- [**Configuration files**](./configuration.md) - schema reference: field types, defaults, `dependsOn`, `elementToggle`,
  validation.
- [**Country localization**](./config-localization.md) - how user-facing strings in config files are extracted and
  translated.

## Message schemas

The string + embed format used in `allowEmbed` config fields. Canonical reference (v2 / v3 / v4):

- [V2 schema](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v2/) - legacy, still parsed when `_schema` is
  absent.
- [V3 schema](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v3/) - tag with `"_schema": "v3"`.
- [V4 schema](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v4/) - tag with `"_schema": "v4"`.

## Migration

- [**Migration**](./migration.md) - writing database migrations so schema changes reach existing installs.

## Validation

Run `npm run verify-configs` to validate every module's config schema. CI runs this on every PR via
`.github/workflows/verify-configs.yml`.