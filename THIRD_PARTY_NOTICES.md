# Third-party notices

This file has three parts: programs Prompt Polish only calls or points to and does not include, programs it looked at and did not use, and the drawings it does include.

## Programs Prompt Polish calls, and does not include

Prompt Polish contains no code or text of the programs below. When the person has installed one from its own source, Prompt Polish runs it or points to it; each stays under its own licence, and `/p_polish carry setup` lists them with the commands to install them.

| Program | By | Licence | What Prompt Polish does with it |
| --- | --- | --- | --- |
| `handoff` skill, in the plugin `mattpocock-skills`: <https://github.com/mattpocock/skills> | Matt Pocock | MIT, "Copyright (c) 2026 Matt Pocock" | `/p_polish carry now` runs the installed skill as one turn of the person's session and keeps the document it wrote, credited to the skill. The official marketplace lists it at commit `49dd158d1076134a641b33efb035946536778336`. |
| `session-report`: <https://github.com/anthropics/claude-plugins-official/tree/main/plugins/session-report> | Anthropic | Apache-2.0 (the `LICENSE` in the plugin's folder) | `/p_polish carry setup` points to it for a report of where a session's tokens went. |
| planning-with-files: <https://github.com/OthmanAdi/planning-with-files> | Ahmad Adi | MIT, "Copyright (c) 2026 Ahmad Adi" | `/p_polish carry setup` points to it. While it is installed, Prompt Polish does not offer its own session trail, which would say the same thing. Version 3.25.0 is what its `marketplace.json` listed when this was written. |
| effortless: <https://github.com/HeyCubit/effortless> | HeyCubit | MIT, "Copyright (c) 2026 HeyCubit" | `/p_polish carry setup` points to it. While it is installed, Prompt Polish does not ask for a handoff at 70% context, because effortless judges handoffs itself. Prompt Polish reads only the list of installed plugins to know it is there, and shares no code, settings or key with it. Version 1.72.0 is what its `plugin.json` said when this was written. |

## Programs looked at, and not used

Prompt Polish keeps its own session trail, which calls no model, instead of relying on these:

- claude-mem (<https://github.com/thedotmack/claude-mem>): the software is Apache-2.0, but it makes its memory with a hosted service (a 30-day trial, then a subscription) or with the person's own model account, so it is not free to run.
- remember (<https://github.com/Digital-Process-Tools/claude-remember>): under a "Community License", which is not open source.
- Basic Memory (<https://github.com/basicmachines-co/basic-memory>): AGPL-3.0.
- The MCP memory server (<https://github.com/modelcontextprotocol/servers/tree/main/src/memory>): a knowledge graph, which does not suit carrying a session over; its licence was moving from MIT to Apache-2.0.

## Drawings

Prompt Polish includes drawings from the projects below, in `hooks/icons.ts` and in the pictures `docs/images/desktop-*.svg`.

## Lucide

The icons beside the pane's buttons and the chevrons of its toggles
(`check`, `rotate-ccw`, `undo-2`, `x`, `circle-stop`, `wand-sparkles`,
`book-open`, `chevron-down`, `chevron-up`, `chevron-left`, `chevron-right`,
`arrow-up`), from
<https://github.com/lucide-icons/lucide>.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

Of the icons used here, `check`, `chevron-down`, `chevron-up`, `circle-stop`
and `x` are derived from the Feather project:

```
The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
