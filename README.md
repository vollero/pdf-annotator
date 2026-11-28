# Margin – PDF Annotator

Mark a passage, draw on a scan, or leave a note on a PDF. Margin works in **desktop Chrome or Chromium 141 or later**. Share a marked-up PDF, or move just your annotations to another copy of the same document.

## Install Margin

1. **[Download Margin for Chrome and Chromium (.zip)](https://github.com/vollero/pdf-annotator/releases/latest/download/margin-pdf-annotator.zip).** The stable ZIP contains the ready-to-use extension.
2. **Extract the ZIP.** On Windows, right-click it and choose **Extract All**. On macOS, double-click it. On Linux, use your archive manager’s **Extract** command. Move the extracted **Margin** folder somewhere you’ll keep it, such as your Documents folder. Open it once to check that it contains `manifest.json`.
3. **Load the extension.** Type `chrome://extensions` into the address bar and press Enter. Turn on **Developer mode** at the top right, click **Load unpacked**, and select the **Margin** folder that contains `manifest.json`. A **Margin – PDF Annotator** card should appear.
4. **Launch Margin.** Open a new tab, click the **Extensions** puzzle-piece button next to the address bar, then click **Margin – PDF Annotator**. Use the pin beside its name if you’d like a toolbar shortcut.

For pictures of the **Load unpacked** button and pin menu, see [Chrome’s illustrated instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

Already using Margin? Keep the existing installation folder when you upgrade so Chromium can reopen your drafts. [Update Margin](#update-margin)

## Try it on the sample

On your first launch from a new tab, Margin opens *Reading the Alps*. It already contains a few example marks.

1. Click **Highlight**, choose a color, and drag across a sentence. The passage appears under **Annotations** on the right.
2. Click **Note**, click a spot on the page, type a comment, and click **Save note**. To edit it later, click **Select**, then the note marker.
3. Click **Export PDF**. Your browser downloads **Reading the Alps-annotated.pdf**. Open that file in your PDF reader to see the marks, or reopen it in Margin to keep editing.

![Margin showing Reading the Alps with a highlighted passage, a note, and the Annotation sets and Timeline buttons above the annotation list.](docs/margin-editor.png)

## Open your own PDF

- **From your computer.** Click **Open PDF** in the editor or drag a PDF onto the page.
- **From a website.** While viewing a PDF whose address path ends in `.pdf`, click Margin in the browser toolbar or Extensions menu. It opens that document in a new editor tab. Margin requests the clicked address without cookies. If the site requires a login, redirects to a download, or uses its own viewer, download the PDF there and use **Open PDF**.
- **On a scanned page,** use **Region** to attach a note to an area, **Draw** for freehand marks, or choose **Highlight** and drag from a blank spot to mark a rectangular area.

Margin accepts PDFs up to **64 MiB** and **3,000 pages**. If a scanned page exceeds the image limit (32 megapixels), open a lower-resolution copy.

Click an entry in **Annotations** to jump to its mark. Open the entry’s **…** menu to edit it or delete it. **Undo** and **Redo** apply to the current editing session.

## Organize annotations into sets

Use sets to keep personal notes and review comments on the same PDF. You can choose which sets to read and which set receives your next annotation.

1. Open **Annotations → Annotation sets**. Existing marks start in **My notes**. Type a name such as **Review comments**, click **Create and use**, then **Done**. New highlights, drawings, notes and passage comments go into that set. Choose **Write new annotations in** to switch sets.
2. To organize a mark you already made, open its **…** menu in the sidebar and choose **Move to set**. **Undo** reverses the move.
3. Under **Visible sets**, uncheck a set to hide its marks on the page, in thumbnails, in the margins and in sidebar search. Check it again to bring them back. You can hide every set. Selecting a set for writing or adding a new mark to it makes it visible.

The number beside each set name is its annotation total for the whole PDF. It includes highlights, drawings, notes and passage comments across all pages. A comment spanning two pages counts once. You can check a hidden or archived set’s total without opening it, even while a sidebar filter is active.

**To send a review copy**, show **Review comments**, hide **My notes**, and click **Export PDF**. The downloaded PDF includes the visible Margin marks. Reopening it in Margin restores the set names attached to those marks. This controls Margin annotations only. Content, attachments and annotations supplied by the original PDF can still be present.

**To continue on another computer**, use **Export annotations** and import the JSON onto the exact same PDF. This carries hidden marks and empty sets as well. The writing set and visibility choices are saved per PDF in the current browser profile.

### Rename an annotation set

Open **Annotations → Annotation sets**, find the set under **Visible sets**, and click **Rename** beside it. For example, change **Review comments** to **Decisions** and press **Enter** or click **Save name**. You can rename any set you created or imported, including a hidden or empty set. **My notes** is the built-in set.

The marks stay together. A hidden set stays hidden, and new marks continue going to the selected writing set. Close the dialog and click **Undo** to restore the previous name. Exported PDFs and annotation files use the name at the time of export. [How imports match set names](docs/annotation-migration.md#version-9-and-annotation-sets)

### Archive a finished review

Open **Annotations → Annotation sets** and click **Archive** beside the named set you want to put away. Its marks leave the page, thumbnails, margins, sidebar and search results. If it was your writing set, new marks go into **My notes**.

To bring it back, open **Archived sets** in the same dialog and click **Restore**. The set becomes visible with its comments, authors and tags. **Undo** and **Redo** also work for archiving and restoring.

Choose **Export PDF** to share the visible review. Choose **Export annotations** to migrate all work, including archived sets and their contents. The recipient can restore those sets in Margin.

## Format a note with Markdown

1. Open a point note, region note, or passage comment and select **Format as Markdown**. Each note starts in plain text.
2. Try the example below. Open **Preview formatting** to see your changes while you write. Bulleted and numbered lists, bold, italics, and inline code work in the preview and the saved note.

   ```markdown
   **Figure 2** needs a correction.
   - Change the unit to `mm`.
   - Check the *horizontal* axis.
   ```

3. Save the note. You can read the formatting in **Annotations**, a page margin, a pinned preview, or an expanded note box. Reopen the note to edit its Markdown source. Clear **Format as Markdown** to display the punctuation literally. Quoted PDF text always reads as it appears in the document.

**Export PDF** gives other PDF readers readable comment text and draws styled text in expanded note boxes. Reopening the PDF in Margin restores the editable Markdown. **Export annotations** carries the source and formatting choice to another copy of the same PDF in Margin. HTML and image syntax display as text.

### Open a web link from a note

1. Open a note, select **Format as Markdown**, and type `Check the [units table](https://example.org/units).` To show the address itself, write `<https://example.org/units>`. Use a full address beginning with `https://` or `http://`.
2. Open **Preview formatting** and click the underlined link, or focus it with **Tab** and press **Enter**. The website opens in a new tab. Your PDF and any unsaved note stay open in Margin.
3. After saving, you can follow the link from **Annotations**, a margin note, or a note preview. In an expanded box on the PDF, use the **Select** tool. Click nearby note text to jump to the annotation or edit the note as usual.

**Export PDF** includes the label and copyable address in the PDF comment and expanded note box. Reopen that PDF in Margin to follow the link again. **Export annotations** preserves the original Markdown for migration. Plain-text notes, code samples, and quoted PDF passages keep their literal spelling.

### Add a multi-line code sample

In a note with **Format as Markdown** selected, type three backticks on a line, paste your code below, then close it with three backticks on their own line. Here is a complete note you can paste into the editor.

````markdown
Check the unit before plotting.

```python
if unit == "mm":
    plot(values)
```
````

Open **Preview formatting** to see the indented sample in monospace. Spaces, tabs and blank lines are part of the sample. Long lines wrap to fit the note. You can use three tildes (`~~~`) for a sample that contains triple backticks. The language name after the opening fence is optional.

**Export PDF** puts the code in the PDF comment and draws it in expanded note boxes. Reopening the PDF in Margin or importing the annotations restores the fences and language name for editing.

### Write an equation in a note

1. Open a note and select **Format as Markdown**. Enclose an inline formula in single dollar signs, such as `$E=mc^2$`. For an equation on its own line, use a pair of dollar signs at each end.
2. Paste the example below and open **Preview formatting**. The first formula appears in the sentence. The fraction appears on its own line.

   ```markdown
   For a circle of diameter $d$, the area is

   $$
   A = \frac{\pi d^2}{4}
   $$
   ```

3. Save the note to see the equation in the sidebar, the page margin, or a pinned preview. Reopen it to edit the LaTeX. An incomplete or unrecognized formula displays its source. Code spans and fenced code blocks keep dollar signs literal. Type `\$` for a literal dollar sign in prose.

Equations render offline in Margin. **Export annotations** preserves the LaTeX in the existing Markdown format. **Export PDF** writes the LaTeX source in PDF comments and expanded boxes, so recipients can copy the formula. Opening that PDF in Margin typesets the equation again.

## Read notes in the page margin

1. Add a note or open an existing one. For a passage comment, select text and choose **Comment**. In the editor, set **Margin placement** to **Left margin** or **Right margin**, then save.
2. Read the note beside its passage as you scroll. A comment that spans pages appears on each quoted page. Click a margin note to read its full text, edit it, or switch sides. Choose **No margin copy** to remove the margin copy. **Undo** reverses the change.
3. Use **Hide workspace** for more reading room. In a narrow window or at high zoom, scroll horizontally to reach the other side. Crowded notes stack in passage order. If a stack is taller than its page, scroll inside that margin.

**Export annotations** carries the chosen side to the same PDF in Margin. **Export PDF** keeps the note anchored on the original page. Other PDF readers can show the annotation there, and reopening the export in Margin restores the margin layout.

## Pin a note preview

1. Hover over a compact note marker or a region’s border in **Select** mode, then click **Pin preview**. You can also open a note’s **…** menu in **Annotations** and choose **Pin preview**. The menu works for expanded notes and passage comments, too.
2. The preview stays in the upper-right corner of the PDF viewer as you scroll, change pages, zoom, or hide the workspace. Its heading identifies the source page. Edits to the note and changes to its action checkbox appear in the preview.
3. Click **Unpin preview** or press **Esc** while reading to close it. With a keyboard, focus a note marker and press **P** to pin or unpin it. Pinning a different note replaces the current preview.

The pin lasts for the current PDF in this tab. Reloading, opening another PDF, or deleting the pinned note clears it.

## Attach a note to a region

1. Choose **Region** (or press **R**) and drag from one corner of a diagram, table, or scanned passage to the opposite corner. You can also click once to start with a small rectangle.
2. Write your note and choose **Save note**. Select **Track as action** if you want a checkbox for the task. The note appears under **Annotations** as a **Region note**.
3. Switch to **Select**. Click the outline to edit the note, drag an edge to move it, or drag its lower-right grip to resize it. The middle stays clear for reading and selecting text. With the outline focused, **Shift + an arrow key** resizes it. **Esc** cancels a drag and **Undo** reverses a saved change.

**Export PDF** includes the outline and its comment so someone can review them in a PDF reader. To send only the annotations, choose **Export annotations**. The recipient can import them with the same PDF in Margin.

## Convert a point note or region note

1. In **Annotations**, find the note you want to change and open its **…** menu. Choose **Convert to region note** to outline the part of the page your comment describes.
2. An expanded point note becomes an outline the size of its text box. A compact marker starts with the same small rectangle you get by clicking **Region** once. The outline starts at the marker’s upper-left corner and shifts inward when it needs room at a page edge. In **Select** mode, drag the border to move it or the lower-right grip to resize it.
3. To collapse a region into a compact marker, open the same menu and choose **Convert to point note**. To recover the exact previous shape, size and position, click **Undo**.

The note keeps its text, color, page and action status. **Export PDF** shows the new shape. **Export annotations** keeps the same annotation ID, so importing the JSON onto the same PDF updates the existing note.

## Resize a note on the page

1. Choose **Select**. Find a marker you placed with **Note** and drag its striped lower-right corner down and to the right. Your note’s text appears inside the box as you drag.
2. Release when you can see the lines you need. The top-left corner stays in place. To make room near a page edge, drag the body of the note toward the middle first. Click the body to open the full text.
3. To return to a compact marker, drag the corner up and left until both sides reach their smallest size. Press **Esc** during a drag to cancel, or choose **Undo** after releasing.

With a keyboard, use **Tab** to focus a note and **Shift + an arrow key** to adjust its width or height. Zoom scales the box with its page. **Note appearance** controls its font and text size. **Export PDF** includes the visible box and its full note text. To move the editable box to another copy of the same PDF, use **Export annotations** and open the JSON with **Import annotations** in Margin.

## Move a note marker

1. Choose **Select** and find a marker you placed with **Note**. Drag it to a new spot on the same page and release. A click opens the note for editing.
2. Press **Esc** during the drag to cancel. After releasing, use **Undo** to return the marker to its previous spot or **Redo** to move it again.

The note keeps its text, color, and action checkbox. Its new position follows the page when you zoom and travels with **Export PDF** and **Export annotations**. Passage comments stay anchored to their quoted words.

## Change the color of an existing annotation

1. In **Annotations**, find the highlight, drawing, note, or passage comment you want to recolor. Open its **…** menu and choose **Change color**.
2. Pick one of your **Saved colors**, click the color well, or type a six-digit **Hex color** such as `#176B87`. Click **Apply color**. For a comment spanning several pages, this updates the entire marked passage.
3. Click **Undo** to restore the previous color. **Export PDF** and **Export annotations** both include the applied color.

The toolbar color still controls your next annotation. You can use a one-off color on a card without adding a swatch to your palette.

## Customize your color palette

1. Click **Edit palette**, the palette icon next to the colored circles in the annotation toolbar.
2. Under **Saved colors**, choose **Add a color…**. Give it a name such as *Needs review*. Click the color well to use the browser’s picker, or enter a six-digit **Hex color** such as `#176B87`.
3. Click **Save and use**. The color moves to the first toolbar position and becomes active for your next highlight, underline, drawing, note, or passage comment. Click another swatch to switch. The toolbar shows five colors at a time. To use another saved color, pick it under **Saved colors** and click **Save and use**.

To edit or remove a color, choose it under **Saved colors**. Change its name or value and click **Save and use**, or click **Remove color**. **Restore defaults** brings back the original five swatches. Existing marks keep their individual colors when you edit the palette.

Margin remembers your palette in this browser profile. Recipients see the colors you used even if they have a different palette. In an Incognito tab, palette changes last until you reload or close that tab.

![The Annotation palette dialog with a new blue color named Needs review, a hex entry field, and the Save and use button.](docs/annotation-palette.png)

## Mark text with different styles

1. Open the arrow beside **Highlight**. Choose **Solid underline**, **Dashed underline**, **Dotted underline**, **Strikethrough**, or **Outline box**. Choose a color and drag over the words. The tool keeps that style for your next mark. Choose **Highlight** in the same menu to return to a filled highlight.
2. If you’ve already selected words with **Select**, use the arrow in the selection toolbar at the bottom of the PDF. Click the button showing the style’s name to mark the words, or click **Comment** to attach a note in that style.
3. To restyle an existing mark, find its card in **Annotations**, open **…**, and change **Markup style**. **Undo** reverses the change. A passage comment keeps its quotation, note, and checkbox.

**Export PDF** keeps the marks visible in other PDF readers. **Export annotations** carries the editable style to another copy of the exact same PDF.

![Six lines from an exported PDF showing a filled highlight, solid underline, dashed underline, dotted underline, strikethrough, and outline box.](docs/text-markup.png)

## Comment on a passage

1. Choose **Select** and select the words you want to discuss. Choose **Comment** at the bottom of the PDF, or press **C** while the text is selected. The same toolbar lets you mark or copy the selection.
2. Read the quotation above the editor, write your comment, and click **Save comment**. Select **Track as action** if you want a checkbox. For a passage that crosses a page break, use **Continuous scrolling** and select across both pages.
3. The **Annotations** panel shows a quotation preview and your comment on one card. Click the card to return to the passage. To read the full quote or edit your comment, click the note marker beside the passage or choose **… → Edit comment**. Search matches both the full quote and your words.

**Export PDF** places your comment and its text markup on each selected page. Reopening it in Margin restores one editable comment. **Export annotations** also keeps the quotation, page positions, comment, and action status together. For a scanned page without selectable text, use **Region** to outline an area or **Note** to comment at a point.

## Tag comments and add an author

Open a passage comment, point note, or region note. Enter a display name in **Author** and comma-separated labels in **Tags**, for example `Methods, Needs evidence`. Both fields are optional. Choose **Save comment** or **Save note**. The sidebar and pinned preview display the attribution and tags.

Choose **Use this author for future comments** before saving to prefill new comments in this browser. To clear the default, save a blank author with the same box checked. In Incognito, the default lasts only for the current workspace tab. Existing comments keep the name entered on them. Anyone receiving the PDF or annotation file can read the author and tags on the included comments.

Use **Filter by author** and **Filter by tag** together to find one reviewer’s comments on a topic. You can also type a name or `#Methods` in **Search annotations**. **Export PDF** writes the native PDF author and includes tags in the comment text. **Export annotations** preserves both fields for editing on another computer.

## Review a note with other people

Open a point note, region note or passage comment and expand **Discussion and version history**. Enter your display name in **Your name for this edit or reply**. This lets Jon revise a comment by Lea while leaving Lea in the comment’s **Author** field. A blank contributor appears as **Anonymous**. Names are entered by reviewers and anyone can choose a name.

- **Keep versions.** Check **Keep a version history for this note** and save. On an existing note, Margin captures the text you started with. Each subsequent saved change to the text or its Markdown setting records the contributor, time and resulting text. Tags, action checkboxes and placement changes leave the version list alone.
- **Read or reuse earlier wording.** Open **Saved versions**. **Use version** puts the earlier wording and formatting into the editor. Save to apply it or cancel to discard it. Clearing the tracking checkbox and saving pauses recording and keeps the versions already collected. Resuming captures the current wording if it changed during the pause.
- **Reply.** Type in **Reply to the original comment** and save. To continue a branch, click the reply count on the annotation card, choose **Reply to #…** beneath the relevant message, type your response and save. You can reply to a reply at any depth within the limit of 200 replies per note. Each reply shows its author, time and parent. Search can find reply text and contributor names.
- **Exchange reviews.** Send **Export annotations** and have the other reviewer import the JSON onto the exact same PDF using **Margin 0.4.0 or later**. It includes the full discussion and retained versions, including earlier wording. When you import their JSON back, replies and versions from both copies are kept by ID. The imported note supplies the current wording. **Export PDF** shares the current note and a readable reply transcript. Reopening that PDF in Margin restores the reply tree. Previous versions stay in your draft and annotation JSON.

## Travel through annotation dates

New highlights, drawings, point notes, region notes and passage comments show their creation time in **Annotations**. After a saved edit, the card also shows the edit time. Dates use your local time zone. An older mark with no recorded creation date shows **Created unknown**. Editing it adds an edit time.

1. Open **Annotations → Timeline**. Under **Annotation dates**, click **Earlier** or **Later**, move the slider, or pick a calendar day to jump to the last known event on or before the end of that day. Margin shows the mark on its PDF page. The list covers creation, the latest edit, dated replies and saved note versions in visible sets.
2. To revisit the whole PDF as you saw it, choose **Recorded drafts** and turn on **Record future drafts on this device**. Margin captures the current draft immediately and then records saved annotation and set changes, including deletions, imports, undo and recovery. Opening a PDF, zooming or switching the visible set does not create a snapshot.
3. Later, open **Recorded drafts**, choose a time, and use **Inspect an annotation** to visit a mark on the PDF. You can read the wording, replies and action status it had then, even if you later deleted it. **Return to current draft** or **Escape** ends the read-only preview. Your edits and undo history stay available.

Recording is optional per PDF and starts when you turn it on. The regular browser profile keeps the latest 50 recorded states, or fewer for large drafts. Pause recording to keep the states already captured. **Clear recorded drafts…** removes the timeline copies for that PDF and stops recording. The separate **Restore previous draft…** recovery copy has its own lifecycle. Incognito lets you browse annotation dates during the session.

**Sharing.** Annotation JSON and annotated PDFs carry known creation and edit times. Full-draft recordings stay on the device. JSON can also include the note versions you elected to retain. A colleague receiving a file can browse the dates it contains and start their own recording. [Annotation migration guide](docs/annotation-migration.md#version-12-and-annotation-dates)

## Restore a previous local draft

After an accidental edit, deletion or import, open **Annotations → Restore previous draft…**. Check the time and annotation count, then choose **Restore draft**. Margin restores all marks, threads, saved versions and annotation sets to their state immediately before the last saved annotation change. The displaced draft becomes the recovery copy, so you can switch back by restoring again.

Margin keeps one recovery copy per PDF in the regular browser profile. It survives reopening the exact PDF, including under a new filename, and can retain recently deleted text. Hiding a set or switching the active set leaves the recovery point in place. Incognito keeps edits in memory. For a copy you can keep longer or move elsewhere, use **Export annotations**.

## Search annotations

In the **Annotations** panel, type in **Search annotations** to find words in notes and highlighted passages. Results update as you type. Click a result, or focus it and press **Enter**, to jump to its mark.

- To find an unfinished correction, choose **To do** and type `Figure 2`. Both words must occur in the annotation. Capitalization and word order can vary.
- To see annotations on a particular page, type `page 12`. Add words, such as `page 12 units`, to narrow the results. Typing just `12` also finds annotations that mention 12 elsewhere.
- Press **Escape** in the search box to clear it. Your page and action filters stay selected. Exports include every mark in the document.

## Track actions with note checkboxes

1. Add a note, or choose **… → Edit note** on an existing one. Describe the action, for example “Correct the units in Figure 2.” Select **Track as action**, then **Save note**.
2. In **Annotations**, tick the note’s **To do** checkbox when you finish. The label changes to **Done**. Untick it to reopen the action. You can also change **Done** inside the note editor.
3. Use the **All annotations** menu to see only **To do** or **Done** actions. The counts follow the search and the **All pages** or **Current page** selection. Choose **All annotations** to see ordinary notes, drawings and highlights again.

**Undo** reverses a checkbox change. To keep the comment and remove its checkbox, edit the note and clear **Track as action**. Status is saved with the document. **Export annotations** carries it to another Margin installation, and **Export PDF** includes it in the comment text for readers outside Margin.

## Make notes easier to read

1. Choose **Note appearance** at the top of the **Annotations** panel or inside an open note. You can adjust the settings while writing a draft.
2. Choose a **Font** (sans serif, serif or monospace), **Text size** (14–32 px) and **Box size** (Compact, Comfortable or Spacious). The preview shows how your text will look. Box size changes the panel width, the writing area and the space available for long comments.
3. Choose **Done** to return to your note. In **Select** mode, hover over a note marker to read it on the PDF, or focus it with **Tab** and press **Enter** to edit. Press **Escape** to dismiss the preview.

Margin starts with 18 px sans serif text and a Comfortable box. It remembers your reading preferences in this browser profile and applies them to existing notes and new ones. Exported annotations carry their text and placement, so each person can choose their own appearance. **Restore defaults** returns all three settings to their starting values.

![Note appearance showing a live preview with 24 px serif text and the Spacious box size.](docs/note-appearance.png)

## Move annotations to another copy of the same PDF

1. Open the PDF you annotated. In the **Annotations** panel, click **Export annotations**. Margin downloads a file such as `Field notes.margin-annotations.json` with your highlights, drawings, notes, and the PDF’s SHA-256 fingerprint. All pages are included, even when the list is filtered. If the panel is hidden, click **Show workspace** or **Toggle annotations** to bring it back.
2. On the other computer, or in a later session, open the **exact same PDF**. Margin **0.4.0** reads annotation formats 1–12, including all files exported by **0.3.0**. For dated annotations, use **0.4.0 or later** on the receiving computer. Send the original PDF separately if the recipient needs it. A renamed copy works. Re-saving the PDF or using **Export PDF** produces a different file when its bytes change.
3. Click **Import annotations** and select the JSON file. Margin checks the fingerprint before applying changes. It adds new marks, updates matching marks, and keeps other local annotations. Importing an identical file twice adds no duplicates. **Undo** reverses the import in one step.

If Margin reports a fingerprint mismatch, locate the copy that was open when you exported the annotations. A matching filename or page count is insufficient. The JSON contains readable note text and selected highlight text. [Annotation file format and worked example](docs/annotation-migration.md)

## Reading controls

The controls at the bottom of the editor change how you read the PDF.

- Choose **Continuous scrolling** in the **Single page** menu to scroll from one page straight into the next. The page counter follows your reading position. Choose **Single page** to switch back.
- Click **Hide workspace** to give the PDF more room. The page, zoom, and scrolling controls stay at the bottom. Click **Show workspace** or press **Esc** to bring the editor back.
- Click **+** or **−** to zoom the PDF. The percentage shows its current scale. The **Fit to width** button resizes the page to the available space. You can also press **+**, **−**, or **0** for the same actions.

Margin remembers your scrolling mode and workspace visibility the next time you open it.

## Where your edits go

**Saved locally** means your draft is stored in this browser profile. Reopen Margin to return to the last document, or open the same PDF again to recover its draft. Local PDFs can be edited offline. In an Incognito window, Margin keeps the document in memory. Export it before closing the tab.

**Export PDF** creates a separate file with the visible highlights, drawings, and notes. Restore archived sets and show every set to include all marks, or use **Export annotations** to keep a complete migration copy before clearing browser data. Your original PDF stays intact. To share a copy with a Margin note removed, delete the note and export again with the current release. Other PDF content, attachments, and metadata can travel with the export. Use a redaction tool for sensitive information in the underlying document.

## Update Margin

1. Download the stable ZIP and extract it. If you want a backup, choose **Export annotations** for each open PDF and keep the JSON with the exact PDF you used. [Download Margin](https://github.com/vollero/pdf-annotator/releases/latest/download/margin-pdf-annotator.zip)
2. Close the Margin tabs. Copy the extracted files into the **same Margin folder** you originally loaded, replacing the old files. Check that `manifest.json` is directly inside that folder.
3. In the same browser profile, open `chrome://extensions`, click **Reload** on the existing Margin card, and reopen Margin. The card should show **0.4.0**. Reopen the original PDF to continue your draft.

If you removed or replaced a note in a PDF exported with an earlier version, open that file in the updated extension and export a fresh copy before sharing it. [Security review](docs/security-review.md)

## Troubleshooting

- **“Manifest file is missing or unreadable.”** Extract the download first. If there are nested folders, select the one where you can see both `manifest.json` and `vendor`. The install link above downloads the packaged extension.
- **The toolbar can’t read a local PDF tab.** Use **Open PDF**, or go to `chrome://extensions` → **Margin** → **Details** and turn on **Allow access to file URLs** to open PDFs directly from local tabs.
- **A PDF asks for a password.** Open an unlocked copy in Margin.

<details>
<summary>Build and test from source (developers)</summary>

With Node.js 24 installed, run these commands in a clone of this repository.

```sh
npm ci
npm run build
```

Load the generated `dist` folder with **Load unpacked**. After a source change, rebuild and click **Reload** on the extension card. Run the unit and Chromium integration tests with the following commands.

```sh
npm test
npx playwright-core install chromium
npm run test:browser
```

Set `CHROMIUM_PATH` to use an installed Chromium binary for the browser test. The source lives in `extension/`. The build bundles PDF.js, pdf-lib, the Marked Markdown parser, KaTeX, fonts, character maps, and image decoders. Margin uses `activeTab` for the tab you click and session-only extension storage to pass its address to the new editor tab.

</details>

<details>
<summary>Sample document artwork</summary>

The sample PDF can be regenerated with `node scripts/sample/create.mjs`. Its embedded landscape illustration is stored in [scripts/sample/alpine-ridge.jpg](scripts/sample/alpine-ridge.jpg). The built-in image generator used this prompt.

> A panoramic analog editorial landscape photograph for an alpine field journal. A sharp, sculptural Dolomite limestone ridgeline, layer after layer of muted blue-grey and warm stone peaks, a dark forested slope low in the foreground. Pale cloudy sky, soft overcast morning light, fine film grain. Frame wide, with the jagged skyline in the middle third. Naturalistic, no people, buildings, lettering, borders or graphics.

</details>

## License

Margin’s original code, documentation, icons, and sample materials are available under the **Apache License 2.0**, to the extent of the contributors’ rights. You can use them in commercial and closed-source projects. When redistributing Margin, include the license, retain applicable notices, and mark files you changed. Contributors grant a patent license for claims covered by section 3. Your own PDFs keep their existing licenses. [Project license](LICENSE)

The extension ZIP includes the project license and the notices for its bundled PDF libraries, fonts, character maps, and image decoders. [Third-party notices](THIRD_PARTY_NOTICES.md)
