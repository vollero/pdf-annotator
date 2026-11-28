# Third-party notices for Margin

Margin distributes the browser builds of PDF.js 5.5.207, pdf-lib 1.17.1, Marked 18.3.0 and KaTeX 0.19.1. The following paths are relative to the extracted extension folder. The build preserves the upstream JavaScript license headers and ships the license files alongside the code for offline use.

## KaTeX

KaTeX converts TeX equations to MathML for Chromium to display using local math fonts. The browser bundle credits Khan Academy and other contributors and includes adapted React utilities under Apache-2.0. The MIT license is in `vendor/KATEX-LICENSE` and the extension includes the Apache license in `LICENSE`. [KaTeX source](https://github.com/KaTeX/KaTeX/tree/v0.19.1)

## Marked

Margin uses Marked to tokenize Markdown note text. Its license and upstream notices are included in `vendor/MARKED-LICENSE`. [Marked source](https://github.com/markedjs/marked/tree/v18.3.0)

## PDF.js

| Component | Attribution and terms | License file in the extension |
| --- | --- | --- |
| PDF.js renderer and worker | Mozilla Foundation, Apache-2.0 | `vendor/PDFJS-LICENSE` |
| Brotli decoder in the worker | Copyright 2017 Google Inc. and the Brotli Authors, MIT | `licenses/Brotli.txt` |
| Adobe CMaps | Adobe Systems Incorporated, BSD-3-Clause | `vendor/cmaps/LICENSE` |
| Foxit fonts | PDFium Authors, BSD-3-Clause | `vendor/standard_fonts/LICENSE_FOXIT` |
| Liberation fonts | Google Corporation and Red Hat, Inc., SIL Open Font License 1.1 with reserved font names | `vendor/standard_fonts/LICENSE_LIBERATION` |
| ICC profiles | CC0 1.0 Universal | `vendor/iccs/LICENSE` |
| JBIG2 decoder and PDF.js wrapper | PDFium Authors, BSD-3-Clause. Mozilla Foundation wrapper, Apache-2.0 | `vendor/wasm/LICENSE_JBIG2`, `vendor/wasm/LICENSE_PDFJS_JBIG2` |
| OpenJPEG decoder and PDF.js wrapper | OpenJPEG contributors and Mozilla Foundation, BSD-2-Clause | `vendor/wasm/LICENSE_OPENJPEG`, `vendor/wasm/LICENSE_PDFJS_OPENJPEG` |
| qcms color conversion and PDF.js wrapper | Mozilla Corporation and Marti Maria, MIT. Mozilla Foundation wrapper, BSD-2-Clause | `vendor/wasm/LICENSE_QCMS`, `vendor/wasm/LICENSE_PDFJS_QCMS` |

PDF.js also credits Opera Software ASA (2014) for the MurmurHash implementation, Glyph & Cog, LLC (1996–2003) for Xpdf's CCITT decoder, and notmasteryet (2011), Yury Delendik and Brendan Dahl for jpgjs. Rob Wu contributed the adapted Content-Disposition parser. Margin adapts PDF.js text-layer styles to position selectable text over each rendered page. The Adobe Glyph List and jpgjs notices are reproduced in `licenses/Embedded-notices.txt`. [PDF.js source at the bundled version](https://github.com/mozilla/pdf.js/tree/v5.5.207)

## pdf-lib

| Component in the browser bundle | Attribution and terms | License file in the extension |
| --- | --- | --- |
| pdf-lib | Copyright 2019 Andrew Dillon, MIT | `vendor/PDF-LIB-LICENSE.md` |
| @pdf-lib/standard-fonts | Copyright 2018 Andrew Dillon, MIT. Based on afm, copyright 2015–2018 Christopher Brown, MIT | `vendor/licenses/standard-fonts.txt`, `licenses/Embedded-notices.txt` |
| @pdf-lib/upng | Copyright 2017 Photopea, MIT | `vendor/licenses/upng.txt` |
| pako and its zlib port | Vitaly Puzrin, Andrei Tuputcyn, Jean-loup Gailly and Mark Adler, MIT and Zlib | `vendor/licenses/pako.txt`, `vendor/licenses/pako-zlib.txt` |
| Embedded tslib 1.11.1 helpers | Microsoft Corporation, Apache-2.0, as identified in the distributed bundle | Header in `vendor/pdf-lib.mjs` and full terms in `vendor/PDFJS-LICENSE` |
| PDFKit SVG path parser and base64-arraybuffer | Devon Govett (2014) and Niklas von Hertzen (2012), MIT. Jeremy Messenger adapted the path parser for pdf-lib | `licenses/Embedded-notices.txt` |
| Stream decoding ports | Copyright 2012 Mozilla Foundation and copyright 1996–2003 Glyph & Cog, LLC, Apache-2.0 | `vendor/PDFJS-LICENSE` |

The standard-font data includes Adobe's Core 14 font metrics, converted to compressed tables by the upstream font package. The original font notices are embedded in those tables, and Adobe's accompanying document is included verbatim at `licenses/Adobe-Core14-MustRead.html`. Unicode encoding notices are reproduced in `licenses/Embedded-notices.txt`. [Upstream metrics and encoding sources](https://github.com/Hopding/standard-fonts/tree/41a6440267de5456042c7bcbac5ec65065e2ef69)

The pdf-lib source credits three Stack Overflow answers for its numeric helpers. The decimal conversion adapts Krisztián Balla’s answer, the byte conversion credits Gregory Pakosz’s algorithm, and the seeded number generator credits Antti Kissaniemi’s answer. [Decimal conversion](https://stackoverflow.com/a/46545519) · [Seeded generator](https://stackoverflow.com/a/19303725) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [Byte conversion](https://stackoverflow.com/a/1936865) · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

Component versions for the prebuilt bundle come from pdf-lib’s release sources. Development and test tools run outside the extension. [pdf-lib release source](https://github.com/Hopding/pdf-lib/tree/v1.17.1) · [Upstream dependency lock](https://github.com/Hopding/pdf-lib/blob/v1.17.1/yarn.lock)

## Android application

The APK includes AndroidX WebKit and its AndroidX dependencies from the Android Open Source Project, and the Kotlin standard library from JetBrains and contributors. These components use the Apache License, Version 2.0. The APK includes the license in its editor assets. Its embedded PDF editor uses the same third-party materials listed above. [AndroidX license](https://github.com/androidx/androidx/blob/androidx-main/LICENSE.txt) · [Kotlin license](https://github.com/JetBrains/kotlin/blob/v2.2.20/license/LICENSE.txt)
