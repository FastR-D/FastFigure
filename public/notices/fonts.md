# Bundled font notices

FastFigure uses **MiSans** in its interface and offers **Noto Serif SC** and **JetBrains Mono** in the canvas font picker. The WOFF2 files in `public/fonts/` were converted from the local FastPPT font assets without changing glyph outlines. MiSans Regular, SemiBold and Bold are separate faces; italic text uses browser synthesis.

| Family | Copyright from the bundled font metadata | License and source |
| --- | --- | --- |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors | [SIL OFL 1.1](fonts/JetBrains-Mono.txt), [upstream](https://github.com/JetBrains/JetBrainsMono) |
| Noto Serif SC | © 2017–2024 Adobe | [SIL OFL 1.1](fonts/Noto-Serif-SC.txt), [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/notoserifsc) |
| MiSans | Copyright © 2020–2023 Beijing Xiaomi Mobile Software Co., Ltd. All Rights Reserved. | [Xiaomi font license](fonts/MiSans-license.pdf), [official download and agreement](https://hyperos.mi.com/font/en/download/), [embedding FAQ](https://hyperos.mi.com/font/en/faq/) |
| Comic Neue (Regular, Bold, Italic, Bold Italic) | Copyright 2014 The Comic Neue Project Authors | [SIL OFL 1.1](fonts/Comic-Neue.txt), [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/comicneue) |
| Patrick Hand | Copyright (c) 2010–2012, Patrick Wagesreiter | [SIL OFL 1.1](fonts/Patrick-Hand.txt), [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/patrickhand) |
| Excalifont Regular | Copyright (c) 2024 by Excalidraw | [SIL OFL 1.1 extracted from original font metadata](fonts/Excalifont.txt), [official distribution](https://plus.excalidraw.com/excalifont) |

The FastPPT MiSans source was reconstructed from `misans@4.1.0` web subsets. Its [npm package LICENSE](fonts/MiSans-npm-package.txt) is retained separately; the package license is not a replacement for Xiaomi's font agreement.

SVG exports retain family names and editable text; they do not embed these font binaries. The fonts remain available to the running application at `/fonts/`.

Comic Sans MS is requested as a system font and is not distributed by FastFigure. Its fallback is the bundled Comic Neue, followed by MiSans for Chinese. The XKCD-inspired theme uses Patrick Hand; the noncommercial xkcd Script font is not bundled. Patrick Hand and Excalifont have one regular face; bold and italic use browser synthesis. Comic Neue and Patrick Hand were converted to WOFF2 without changing outlines. Excalifont is the unmodified official full WOFF2, including Greek and Cyrillic glyphs.
