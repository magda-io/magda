# Third-Party Source Availability

The MAGDA Agent Workspace Docker image includes Sharp, prebuilt libvips and
LibreOffice-kit/WASM. These components retain their own licenses; MAGDA remains
licensed under Apache-2.0.

This document records source locations for the versions selected by DSH
`0.2.1-alpha.1`, built from MAGDA's maintenance tag `magda/0.2.1-alpha.1/1.0.1`
(commit `c929e29667e6ccac97c1575e18fb56b1c9ead6c6`) in
[magda-io/dsh-fork](https://github.com/magda-io/dsh-fork). It extends the
official upstream baseline `upstream/0.2.1-alpha.1`
(`5badb15009ae1756c3afe0ae0cef1faafc290ccc`) with changes to DSH's Office
skills and `check_office.py` only; package versions and the dependency
lockfile are unchanged.
It is installed at `/usr/local/share/magda-agent/THIRD_PARTY_SOURCES.md`.
Source is available from the upstream locations below; no separate release-specific
source manifest is needed to use these references.

## Sharp 0.35.3

License: Apache-2.0.

- [Source and build files](https://github.com/lovell/sharp/tree/1018449164723ba0203c1beffaba0e21f7829c18)
- [Source archive](https://github.com/lovell/sharp/archive/1018449164723ba0203c1beffaba0e21f7829c18.tar.gz)
- Included license: `/usr/local/lib/magda-agent/dsh/node_modules/sharp/LICENSE`.

The architecture-specific `@img/sharp-linux-arm64` or `@img/sharp-linux-x64`
package is also version 0.35.3 and retains its Apache-2.0 license.

## Prebuilt libvips and bundled native dependencies

The image includes `@img/sharp-libvips-linux-arm64@1.3.2` or
`@img/sharp-libvips-linux-x64@1.3.2`, containing libvips 8.18.3 and its native
dependencies.

Licenses: LGPL-3.0-or-later and other component-specific licenses, as documented
by the upstream bundle. Its LGPLv3 licensing uses the "any later version" provision
of LGPLv2/LGPLv2.1 where applicable.

- [Bundle source/build repository at the published package's gitHead](https://github.com/lovell/sharp-libvips/tree/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6)
- [Build scripts, dependency source downloads and applied patches](https://github.com/lovell/sharp-libvips/blob/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/build/posix.sh)
- [Exact bundled dependency versions](https://github.com/lovell/sharp-libvips/blob/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/versions.properties)
- [Upstream dependency license summary](https://github.com/lovell/sharp-libvips/blob/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/THIRD-PARTY-NOTICES.md)
- [libvips 8.18.3 source](https://github.com/libvips/libvips/tree/3664cfc5dc2c5661288f5bf5a85ccc51c64c1626)
- [libvips 8.18.3 source archive](https://github.com/libvips/libvips/archive/3664cfc5dc2c5661288f5bf5a85ccc51c64c1626.tar.gz)

The bundle's build scripts identify the additional dependency source archives and
patches used with libvips. Use those scripts together with the version list, rather
than the libvips source alone, when obtaining the bundle's source/build materials.

Inside the image, the selected bundle's `README.md` retains its dependency license
summary and `versions.json` records its component versions. Both are under:

```text
/usr/local/lib/magda-agent/dsh/node_modules/@img/sharp-libvips-linux-arm64/
/usr/local/lib/magda-agent/dsh/node_modules/@img/sharp-libvips-linux-x64/
```

Only the directory matching the image architecture is present. Sharp loads the
libvips shared library from that directory; an interface-compatible replacement
can be supplied in a derived image. GPLv3 and LGPLv3 license texts are included at
`/usr/share/common-licenses/GPL-3` and `/usr/share/common-licenses/LGPL-3`.

## LibreOffice-kit and WASM engine 0.1.5

Licenses: MPL-2.0, with the separately retained notices and terms for incorporated
third-party components.

- [Upstream adapter/build project](https://github.com/deepseek-ai/dsh-libreoffice-kit/tree/b19bb73c74ed893b8a5d1716d32df32a113ed31b)
- [WASM build recipe](https://github.com/deepseek-ai/dsh-libreoffice-kit/blob/b19bb73c74ed893b8a5d1716d32df32a113ed31b/engine/wasm-source/build.mjs)
- [LibreOffice core source identified by the shipped source receipt](https://github.com/LibreOffice/core/tree/bce0998afefdbc355585ca324285661a2170ba77)
- [LibreOffice core source archive](https://github.com/LibreOffice/core/archive/bce0998afefdbc355585ca324285661a2170ba77.tar.gz)

The image retains the adapter's `LICENSE` and `NOTICE` in
`/usr/local/lib/magda-agent/dsh/node_modules/@deepseek-ai/libreoffice-kit/`.
The engine package below retains its `licenses/` directory, `prebuilds.json`, and
`sources/`, including the exact core revision, `source-changes.patch`, build
configuration, recipes and additional patches:

```text
/usr/local/lib/magda-agent/dsh/node_modules/@deepseek-ai/libreoffice-kit-wasm/
```

Obtain the core source at the recorded revision and apply the shipped patches;
use the shipped recipes/configuration for the engine build. These materials are
also included in the [published WASM 0.1.5 package](https://registry.npmjs.org/@deepseek-ai/libreoffice-kit-wasm/-/libreoffice-kit-wasm-0.1.5.tgz).

## Office Python libraries and fonts

DSH's `office-docx`, `office-pptx` and `office-xlsx` skills run the Python
returned by `load_workspace_dependencies`: a read-only virtual environment at
`/usr/local/lib/magda-agent/primary-runtime/dependencies/python` over Debian's
`/usr/bin/python3`. Its pure-Python libraries are installed at build time from
PyPI wheels pinned by SHA-256 in
[`office-runtime/requirements.txt`](office-runtime/requirements.txt), copied
from DSH `dsh-v0.2.1-alpha.1` `scripts/primary-runtime/lock.json`:

| Distribution        | Version | License      | Source                                                                      |
| ------------------- | ------- | ------------ | --------------------------------------------------------------------------- |
| `python-docx`       | 1.2.0   | MIT          | [python-openxml/python-docx](https://github.com/python-openxml/python-docx) |
| `python-pptx`       | 1.0.2   | MIT          | [scanny/python-pptx](https://github.com/scanny/python-pptx)                 |
| `openpyxl`          | 3.1.5   | MIT          | [openpyxl/openpyxl](https://foss.heptapod.net/openpyxl/openpyxl)            |
| `XlsxWriter`        | 3.2.9   | BSD-2-Clause | [jmcnamara/XlsxWriter](https://github.com/jmcnamara/XlsxWriter)             |
| `typing_extensions` | 4.16.0  | PSF-2.0      | [python/typing_extensions](https://github.com/python/typing_extensions)     |
| `et_xmlfile`        | 2.0.0   | MIT          | [openpyxl/et_xmlfile](https://foss.heptapod.net/openpyxl/et_xmlfile)        |

Each wheel's license and metadata are retained in its `*.dist-info` directory
under `.../dependencies/python/lib/python3.11/site-packages/`. Native
dependencies (`lxml`, `Pillow`, `numpy`, `pandas`) and the fonts the
LibreOffice Kit renders with (`fonts-liberation2`, `fonts-crosextra-carlito`,
`fonts-crosextra-caladea`, `fonts-dejavu-core`) are Debian packages.

## Other notices and maintenance

Upstream DSH's license and third-party notices are retained at
`/usr/local/share/magda-agent/LICENSE` and
`/usr/local/share/magda-agent/THIRD_PARTY_NOTICES.md`. Dependency package notices
are retained in their installed directories. Debian package copyright/source
information is in `/usr/share/doc/<package>/copyright`.

These source directions supplement, rather than replace, the applicable license
texts and copyright notices. Update this document when the selected dependency
versions or source/build references change.
