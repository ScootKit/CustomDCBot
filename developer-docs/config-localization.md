# Config Localization System

## Overview

Configuration files (`config.json`) currently embed all translations inline as localized objects:

```json
{
  "description": {
    "en": "Configure settings",
    "de": "Einstellungen konfigurieren"
  },
  "humanName": {
    "en": "Configuration",
    "de": "Konfiguration"
  }
}
```

The new system moves all non-English translations to external files in `config-localizations/<lang>.json`, keeping only
the English value inline as a plain string:

```json
{
  "description": "Configure settings",
  "humanName": "Configuration"
}
```

German (and any other language) lives in `config-localizations/de.json`:

```json
{
  "module-name": {
    "config": {
      "description": "Einstellungen konfigurieren",
      "humanName": "Konfiguration"
    }
  }
}
```

## What gets localized

| Property                          | Where it appears                                    | Localized?                    |
|-----------------------------------|-----------------------------------------------------|-------------------------------|
| `description`                     | Top-level, fields, params                           | Yes                           |
| `humanName`                       | Top-level, fields                                   | Yes                           |
| `default` (string/embed types)    | Fields with `type: "string"`, `"emoji"`, `"imgURL"` | Yes                           |
| `default` (all other types)       | Booleans, integers, IDs, arrays, selects, keyed     | **No** - values are universal |
| `displayName`                     | Categories, select options with object content      | Yes                           |
| `configElementName`               | Top-level (configElements files)                    | Yes                           |
| `warningBanner`                   | Top-level                                           | Yes                           |
| `commandsWarnings.special[].info` | Top-level                                           | Yes                           |
| `params[].description`            | Inside field params                                 | Yes                           |
| `links[].label`                   | Inside field links                                  | Yes                           |

### Why some defaults are not localized

- **Booleans**: `true`/`false` - universal
- **Integers/Floats**: Numbers - universal
- **Colors**: Color names like `"GREEN"`, `"ORANGE"` or hex codes - universal
- **Channel/Role/User IDs**: Discord snowflakes - universal
- **Select values**: The stored value is a code (`"daily"`, `"none"`) - universal. The _display name_ of select options
  IS localized separately
- **Arrays of IDs**: Lists of snowflakes - universal
- **Keyed maps**: Key-value maps where keys/values are IDs or numbers - universal
- **Timezones**: Timezone strings like `"Europe/Berlin"` - universal

## Localization file structure

```
config-localizations/
  en.json           # English (reference/fallback)
  de.json           # German
  generate-files.js # Extraction script
```

Each language file follows this structure:

```json
{
  "_core": {
    "<filename>": {
      "description": "...",
      "humanName": "...",
      "content": {
        "<fieldName>": {
          "humanName": "...",
          "description": "...",
          "default": "..."
        }
      }
    }
  },
  "<module-name>": {
    "<filename>": {
      "description": "...",
      "humanName": "...",
      "categories": {
        "<categoryId>": {
          "displayName": "..."
        }
      },
      "content": {
        "<fieldName>": {
          "humanName": "...",
          "description": "...",
          "default": "...",
          "params": {
            "<paramName>": {
              "description": "..."
            }
          },
          "selectOptions": {
            "<optionValue>": {
              "displayName": "..."
            }
          }
        }
      }
    }
  }
}
```

- `_core` contains config-generator files (bot-level config, strings)
- Module names match directory names (`birthday`, `moderation`, `activity-streak`, etc.)
- File keys are filenames without `.json` (`config`, `lockdown`, `strings`, etc.)
- Only keys that have a translation are present - missing keys fall back to English

## Extraction script

`config-localizations/generate-files.js` scans all config files and extracts localized objects into per-language files:

```bash
node config-localizations/generate-files.js
```

This regenerates ALL language files from the current config sources. Run it after modifying any config file.

## Implementation plan

### Phase 1: Generate localization files (done)

The `generate-files.js` script extracts all existing translations into `en.json` and `de.json`.

### Phase 2: Modify configuration loader

Update `src/functions/configuration.js` to resolve translations from the external files.

The `checkConfigFile` function needs to be updated so that when it reads a config schema, it checks if a field value is
a plain string (new format) or a localized object (old format for backwards compatibility). If it's a plain string, it
looks up the translation from `config-localizations/<locale>.json`.

Specifically, a new function `resolveLocalization(scope, fileName, fieldPath, value, locale)` should:

1. If `value` is already a localized object (`{en: ..., de: ...}`), use the old behavior (backwards compatible)
2. If `value` is a plain string/value (new format), look up the translation:
    - Load `config-localizations/<locale>.json` (cache it)
    - Navigate to `[scope][fileName][fieldPath]`
    - Return the translated value if found, otherwise return the English value

This must handle:

- Top-level `description`, `humanName`
- Field-level `humanName`, `description`, `default`
- `params[].description`
- `categories[].displayName`
- `commandsWarnings.special[].info`
- Select option `displayName`
- `configElementName`
- `warningBanner`
- `links[].label`

### Phase 3: Convert config files to new format

Write a second script (`config-localizations/convert-configs.js`) that:

1. Reads each config JSON file
2. For every localized object (`{en: ..., de: ...}`), replaces it with just the English value
3. Skips `default` on non-string types (they already aren't localized objects for boolean/integer/etc, but some may
   have `{en: false}` which should become just `false`)
4. Writes the simplified config file back

This converts:

```json
{
  "description": {
    "en": "Configure here",
    "de": "Hier konfigurieren"
  },
  "content": [
    {
      "name": "enabled",
      "type": "boolean",
      "default": {
        "en": false
      },
      "description": {
        "en": "Enable?",
        "de": "Aktivieren?"
      }
    }
  ]
}
```

To:

```json
{
  "description": "Configure here",
  "content": [
    {
      "name": "enabled",
      "type": "boolean",
      "default": false,
      "description": "Enable?"
    }
  ]
}
```

Note: `default: { "en": false }` becomes `default: false` - the `{en: ...}` wrapper is removed for ALL defaults, not
just strings. The localization files only store string defaults, but the config files should be cleaned up uniformly.

### Phase 4: Update SCNX dashboard integration

The SCNX dashboard reads config schemas directly. It needs to be updated to:

1. Load the localization files
2. Apply translations when rendering field labels, descriptions, and defaults
3. Fall back to the inline English value when no translation exists

### Phase 5: Add translation workflow

- Add `config-localizations/` to the Weblate translation project
- Translators edit the language JSON files directly
- Running `generate-files.js` is only needed to bootstrap new configs or verify the structure
- New languages are added by creating a new `<lang>.json` file following the same structure

## For module developers

When writing a new config file, use plain English strings everywhere:

```json
{
  "description": "Configure the example module",
  "humanName": "Configuration",
  "filename": "config.json",
  "content": [
    {
      "name": "logChannel",
      "type": "channelID",
      "humanName": "Log Channel",
      "description": "Channel for log messages.",
      "default": ""
    },
    {
      "name": "welcomeMessage",
      "type": "string",
      "allowEmbed": true,
      "humanName": "Welcome Message",
      "description": "Message sent when a user joins.",
      "default": "Welcome %user%!"
    }
  ]
}
```

Translations are handled externally. After adding your config, run `node config-localizations/generate-files.js` to add
English entries to `en.json`. Translators will add the other languages.