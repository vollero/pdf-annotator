# Margin

Margin is a Chromium extension for annotating PDFs. Open a local file, drop one onto the editor, or click the extension while viewing a URL ending in `.pdf`. A three-page illustrated sample opens on first launch.

## Install

Use Node.js 24 and Chromium 141 or newer.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the generated **dist** directory. Click **Margin** in the Extensions menu to open the editor. After changing the source, repeat the build and click the extension’s reload button.

## Annotate a PDF

- **Highlight** selected text by dragging across it. Drag from a blank part of a page to highlight a rectangular area, including on scanned pages.
- **Draw** with a mouse, pen, or touch. Select a color in the toolbar before adding a mark.
- **Note** opens a text editor wherever you click. Click a note marker with **Select** to edit it.
- Click an annotation in the sidebar to jump to it. Its menu lets you delete the mark or edit a note. Undo and redo apply to the current editing session.
- **Export PDF** downloads a copy with standard PDF highlight, ink, and text annotations. The source file stays intact. Reopen a Margin export to keep editing its annotations.

The editor saves documents and drafts in IndexedDB in the local browser profile. Launching it again restores the last document. Reopening the same file restores its draft, even if another PDF has been opened since. Removing the extension or clearing its storage removes those drafts. Export a copy to keep it independently.

PDFs with an opening password need an unlocked copy. For local PDF tabs, direct access depends on Chromium’s **Allow access to file URLs** setting. The file picker works without that setting. Sites that serve PDFs through a viewer or require special authentication may also require opening a downloaded copy.

## Development

The extension sources are in `extension/`. The build packages PDF.js, pdf-lib, fonts, character maps and image decoders alongside the UI. A single `activeTab` permission is used to read a PDF from the tab where the toolbar action was invoked. The editor runs locally.

```sh
npm run build
npm test
npx playwright-core install chromium
npm run test:browser
```

Set `CHROMIUM_PATH` to use an installed Chromium binary for the browser test. The tests exercise native annotation geometry on a cropped, rotated page, Unicode comments, preservation of existing annotations, and the editing and export workflow in a loaded extension.

<details>
<summary>Sample document artwork</summary>

The sample PDF can be regenerated with `node scripts/sample/create.mjs`. Its embedded landscape illustration is stored in [scripts/sample/alpine-ridge.jpg](scripts/sample/alpine-ridge.jpg). The built-in image generator used this prompt.

> A panoramic analog editorial landscape photograph for an alpine field journal. A sharp, sculptural Dolomite limestone ridgeline, layer after layer of muted blue-grey and warm stone peaks, a dark forested slope low in the foreground. Pale cloudy sky, soft overcast morning light, fine film grain. Frame wide, with the jagged skyline in the middle third. Naturalistic, no people, buildings, lettering, borders or graphics.

</details>
