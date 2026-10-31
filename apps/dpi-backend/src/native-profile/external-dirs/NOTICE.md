# Pi Durable external directories

Native adaptation of the behavior of **pi-add-dir 1.3.1** by itisbryan:
https://github.com/itisbryan/pi-add-dir

Reference source on this machine: `pi-add-dir/extensions/pi-add-dir/index.ts`.
This is not a Pi ExtensionAPI compatibility layer and does not execute that extension.
Directory context, explicit skill discovery, filename search and conversation persistence
are implemented using native Durable 1.4.0 documents, sections and tool callbacks.
The upstream suggestion engine and interactive directory pickers have not been ported.
The existing project-owned upstream skills loader is reused; its attribution remains
in `../skills/NOTICE.md` and the adjacent upstream source tree.

Unlike upstream's cwd-keyed temporary file, selections live in a native session document
partitioned by conversation. There is no temporary state shared between same-cwd sessions.
External `.pi/extensions` are never imported. A trusted bootstrap must supply allowed
roots and a callback that checks CURRENT grants. Selecting a directory does not grant
filesystem access or change the working directory.

## Hot attachment

`createExternalDirectoryAdapter(options)` returns a resource-free native registry adapter.
It retains neither a Harness nor invocation-bound document capabilities. Every tool and
prompt section uses the access supplied by its current Durable invocation. A compatible
bootstrap can include the adapter in its trusted `loadAdapters` list and use native
`/reload` while idle. Removing the adapter removes its tools/context without deleting
selections; reattaching restores them. Files and skill bodies are rediscovered on use.

This module supplies native tools and prompt context, not terminal `/add-dir`, `/dirs`,
`/remove-dir`, `/suggest-dirs` commands or the terminal `$` catalogue transport yet.
`catalogue`/`getSkill` are callable by a trusted, bound composition; metadata alone is
injected automatically. Do not advertise full terminal command compatibility.

## Upstream MIT license

MIT License

Copyright (c) 2026 itisbryan

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
