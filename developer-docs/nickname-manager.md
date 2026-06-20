# Nickname Manager

Several modules want to change a member's nickname at the same time - the `nicknames` module applies a role-based
name, `afk-system` wraps it with `[AFK]`, `moderation` can rename muted/quarantined users, and so on. If each module
called `member.setNickname()` directly they would fight each other and overwrite each other's changes.

The **Nickname Manager** is a single service that owns all bot-initiated nickname changes. Modules describe *what* they
want to contribute to a member's name; the manager renders the final string from every contribution and calls Discord's
`setNickname` once, only when the result actually differs from what Discord currently shows.

It is available on the client as `client.nicknameManager` and is always present (core service).

## The model

A member's nickname is built from **contributions**. Each contribution has a **position** that decides where it lands:

| Position        | Effect                                                                                                                                 | `value`                             |
|-----------------|----------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------|
| `base`          | The core name. The highest-priority `base` wins. If no module supplies one, the manager derives it from the member's current nickname. | string                              |
| `prefix`        | Text placed before the name.                                                                                                           | string                              |
| `suffix`        | Text placed after the name.                                                                                                            | string                              |
| `wrap`          | Wraps the whole rendered name (applied outermost).                                                                                     | function `(inner) => string`        |
| `baseTransform` | Rewrites the base string itself, e.g. a name sanitizer. Applied to the base before prefixes/suffixes. *(advanced)*                     | function `(base, member) => string` |

Each contribution also carries:

- `source` *(string, required)* - a unique id for this contribution. A source can only have one contribution per
  member at a time; setting it again replaces the previous one.
- `priority` *(number, default `0`)* - higher wins for `base`; for `prefix`/`suffix`/`wrap` it orders them from the
  inside (closest to the base) out.
- `exclusive` *(boolean, default `false`)* - among `exclusive` contributions in the same position, only the
  highest-priority one renders. Use this when two modules must not both decorate the same slot.
- `match` *(RegExp, optional)* - for an affix whose value changes over time (e.g. an activity streak ` 🔥3` → ` 🔥4`),
  this tells the manager how to find and strip the previous value so it never doubles up.

## Worked example

Say a member's display name is `Alex`, and three modules contribute:

| Source                        | Position | Value                 | Priority |
|-------------------------------|----------|-----------------------|----------|
| `nicknames` (role-based name) | `base`   | `"Alex"`              | 100      |
| `nicknames` (role prefix)     | `prefix` | `"[Mod] "`            | 10       |
| `levels` (rank tag)           | `suffix` | `"                    | Lvl 5"`  | 10 |
| `afk-system` (AFK marker)     | `wrap`   | `(s) => "[AFK] " + s` | 500      |

The manager renders them in this order:

```
 base                                  Alex
 + prefix            →          [Mod] Alex
 + suffix            →          [Mod] Alex | Lvl 5
 wrap (outermost)    →   [AFK] [Mod] Alex | Lvl 5
```

So Discord shows: **`[AFK] [Mod] Alex | Lvl 5`**.

When the member stops being AFK, `afk-system`'s provider returns `null`, the `wrap` contribution disappears, the manager
re-renders to `[Mod] Alex | Lvl 5`, and (because that differs from the live nickname) writes it once. If nothing a
member sees would change, the manager renders the same string and makes **no** Discord call.

Finally, the result is truncated to Discord's 32-character nickname limit (code-point aware, so an emoji on the boundary
is never split).

## Registering a provider (recommended)

The usual way to integrate is a **provider**: a function the manager calls for a member whenever that member needs
re-rendering. It returns a contribution, an array of contributions, or `null` for "nothing right now".

Register it once, from your module's `onLoad.js` (see [Module setup](#module-setup)):

```js
// modules/afk-system/onLoad.js
module.exports.onLoad = function (client) {
    if (client.afkSystemProviderRegistered) return; // guard against double registration
    client.afkSystemProviderRegistered = true;

    client.nicknameManager.registerProvider('afk', 'afk-system', async (member) => {
        const AFKUser = client.models?.['afk-system']?.['AFKUser'];
        if (!AFKUser) return null;
        const session = await AFKUser.findOne({where: {userID: member.id}});
        if (!session) return null; // not AFK -> contribute nothing
        return {
            source: 'afk',
            position: 'wrap',
            value: (s) => '[AFK] ' + s,
            priority: 500
        };
    });
};
```

`registerProvider(source, moduleName, fn)`:

- `source` - unique key for this provider.
- `moduleName` - your module's name. The manager skips providers whose module is disabled and clears their
  contributions, so a disabled module never affects nicknames.
- `fn(member)` - sync or async; returns a contribution / array / `null`.

A provider can return several contributions at once - the `nicknames` module returns a `base` plus an optional role
`prefix`/`suffix`:

```js
client.nicknameManager.registerProvider('nicknames', 'nicknames', async (member) => {
    // ...resolve baseName and the matched role config...
    const out = [{source: 'nicknames:base', position: 'base', value: baseName, priority: 100}];
    if (matched?.prefix) out.push({
        source: 'nicknames:rolePrefix',
        position: 'prefix',
        value: matched.prefix,
        priority: 10
    });
    if (matched?.suffix) out.push({
        source: 'nicknames:roleSuffix',
        position: 'suffix',
        value: matched.suffix,
        priority: 10
    });
    return out;
});
```

## Triggering an update

Providers run when the manager re-renders a member. Ask for a render with:

```js
client.nicknameManager.attachMember(member);      // give the manager a live GuildMember to write to
client.nicknameManager.requestUpdate(member.id);  // schedule a (debounced) re-render + flush
```

Call these whenever your module changes something that affects the name (a member went AFK, a role changed, a streak
ticked). The manager re-runs every provider, renders, and writes to Discord only if the result changed. Writes are
serialized per member, so concurrent updates can't race.

## Direct contributions (without a provider)

If you'd rather push a contribution imperatively instead of recomputing it on every render, use `set` / `clear`:

```js
client.nicknameManager.set(member.id, 'my-source', {position: 'suffix', value: ' ⭐', priority: 5});
client.nicknameManager.clear(member.id, 'my-source');
```

`set`/`clear` mark the member dirty and schedule a flush automatically (if the manager has a live member ref).

## External edits

`getLastRendered(memberId)` returns the last value the manager wrote. The `nicknames` module uses this to detect when a
user or moderator renames someone by hand (the live nickname differs from `lastRendered`) and persists that as the new
`base` via `persistExternalEditAsBase`, so manual edits stick instead of being reverted on the next render.

## Module setup

Run your registration once at startup by pointing `module.json` at an on-load file:

```json
{
  "name": "afk-system",
  "on-load-event": "onLoad.js",
  "...": "..."
}
```

`onLoad.js` exports `module.exports.onLoad = function (client) { ... }`. Guard with a boolean flag on `client` (as in
the
examples above) so re-runs don't register the provider twice.

## API summary

| Method                                                                     | Purpose                                                             |
|----------------------------------------------------------------------------|---------------------------------------------------------------------|
| `registerProvider(source, moduleName, fn)`                                 | Add a provider that computes contributions on demand.               |
| `unregisterProvider(source)`                                               | Remove a provider.                                                  |
| `registerGlobalTransform(source, moduleName, {position, value, priority})` | A contribution applied to *every* member.                           |
| `unregisterGlobalTransform(source)`                                        | Remove a global transform.                                          |
| `set(memberId, source, contribution)`                                      | Push a single contribution imperatively.                            |
| `clear(memberId, source)`                                                  | Remove a previously set contribution.                               |
| `clearAllForSource(source)`                                                | Drop a source's contribution from every member.                     |
| `attachMember(member)`                                                     | Give the manager a live `GuildMember` so it can write during flush. |
| `requestUpdate(memberId)`                                                  | Schedule a re-render + flush.                                       |
| `getLastRendered(memberId)`                                                | The last nickname the manager wrote (detect external edits).        |