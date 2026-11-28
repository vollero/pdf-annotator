# Move Margin annotations between sessions or computers

Choose **Export annotations** in the **Annotations** panel to download a `.margin-annotations.json` file. Open the same PDF and choose **Import annotations**. The import reports how many marks it added and updated. You can reverse the entire import with **Undo**. In Incognito, export any annotations you want to keep before closing or reloading the tab.

The newest feature used by any annotation determines which release can open the file.

| Feature in the export | JSON version | Earliest compatible Margin release |
| --- | --- | --- |
| Left or right margin placement | 7 | 0.3.0-rc.13 |
| Region note | 6 | 0.3.0-rc.10 |
| Resized point note | 5 | 0.3.0-rc.9 |
| Underline, strikethrough or outline | 4 | 0.3.0-rc.5 |
| Passage comment | 3 | 0.3.0-rc.4 |
| Action checkbox | 2 | 0.3.0-rc.2 |
| Compact point note, drawing or filled highlight | 1 | 0.2.0 |

For example, suppose you marked up `Survey.pdf` on your laptop. Send the JSON to a colleague who already has that PDF. Their copy can be named `Survey for review.pdf`. Margin calculates SHA-256 over every byte of the PDF they open and compares it with the fingerprint in the JSON. The check also works offline.

**Choosing the right PDF.** Keep the exact source file with your annotation export. Editing the PDF in another program, changing its metadata, or exporting a marked-up PDF can change its bytes even if its pages look identical. If you reopened a marked-up PDF before exporting its annotations, use that specific marked-up PDF for the import. A fingerprint mismatch stops the import before it changes the draft.

**What travels.** The file contains all editable Margin text markup, passage comments, freehand drawings, point notes and region notes, across every page. A highlight can include the text you selected. Anyone who receives the JSON can read that text and your comments. The PDF, attachments, other editors’ native annotations, document URL, browser preferences and history stay outside this format. Use **Export PDF** when someone wants a document they can open in an ordinary PDF reader.

**Importing into an existing draft.** Margin matches annotations by ID. A new ID adds a mark. If the same ID has different content, the imported version replaces the local version, even when the imported file is older. Other local marks stay in the draft. Deleting a mark on one computer does not propagate a deletion through a later import. An empty export adds nothing. An invalid entry, a duplicate ID, an unsupported version, or a combined draft over the size limit rejects the whole import.

## Version 1 file format

The file is UTF-8 JSON. This complete example adds one note to the *Reading the Alps* PDF bundled with Margin 0.2.0. Save the block as `Alps.margin-annotations.json` and import it with that sample open.

```json
{
  "format": "margin-annotations",
  "version": 1,
  "documentSha256": "bea4b9b895421a010ec6909cdf9badb4aeb093e664fe5bb876a01e5f8e94b259",
  "annotations": [
    {
      "id": "alps-review-note",
      "type": "note",
      "page": 1,
      "color": "#91b9dd",
      "text": "Compare this ridge with the profile on page two.",
      "point": [0.65, 0.4]
    }
  ]
}
```

The fingerprint uses 64 lowercase hexadecimal characters. It identifies the PDF bytes. It does not authenticate the author of an annotation file.

Every annotation carries a unique string ID, a one-based page number, a six-digit hexadecimal color beginning with `#`, and a text string. The color is the exact value used on the mark. Recoloring an existing mark updates its `color` value and keeps its ID, so importing the file updates the corresponding mark on the other computer. All format versions use this same field. Palette names and saved swatches are browser preferences. Coordinates are fractions of the displayed page measured from its top-left corner. Each coordinate or dimension is between 0 and 1.

| Type | Geometry field | Value |
| --- | --- | --- |
| `note` | `point` | One `[x, y]` pair |
| `draw` | `points` | Two or more `[x, y]` pairs in stroke order |
| `highlight` | `rects` | One or more `[x, y, width, height]` rectangles |

Moving a note on its page updates its `point` and preserves its ID. Import the new annotation file on the other computer to move the corresponding marker. Earlier format versions already support these coordinates.

## Version 2 and action checkboxes

For documents without margin notes, regions, resized notes, passage comments or styled marks, when at least one note has **Track as action** selected, Margin exports the whole document’s annotations with `"version": 2`. A note can have one extra field, `done`. Set it to `false` for **To do** or `true` for **Done**. Omitting it makes the note an ordinary comment. For example, change the version in the sample above to 2 and add `"done": false` alongside the note’s `"point"` field to import it as an open action.

Importing a matching note ID updates its checkbox along with its text. Importing an ordinary note over a tracked note removes its checkbox. Filtering the sidebar by status or page never limits the export. Documents with only compact ordinary notes without a margin copy, drawings and filled highlights use version 1.

## Version 3 and passage comments

Passage comments require at least version 3. One `comment` entry holds the author’s words in `text` and an ordered `passages` array. Each passage has its one-based `page`, the selected `quote`, and the line rectangles in `rects`. The mark’s top-level `page` is the first quoted page. A comment can span multiple pages and has a single ID and an optional `done` checkbox. An import updates the entire comment in one operation. The PDF fingerprint check applies exactly as in earlier versions.

## Version 4 and text markup styles

A document containing any underline, strikethrough, or outline uses at least version 4. A `highlight` or `comment` entry can carry one optional `style` field. Its value is `underline`, `dashed-underline`, `dotted-underline`, `strikethrough`, or `outline-box`. For example, add `"style": "dashed-underline"` to a highlight entry to draw a dashed line under each selected line of text. A comment’s style applies to every passage in that comment. Omit `style` for a filled highlight.

Importing an existing ID also updates its style. Switching every styled mark back to **Highlight** lets Margin export the lowest format version required by the remaining annotations.

## Version 5 and resized notes

Expanded point notes require at least version 5. Its `note` entry carries `size` as a pair of positive fractions up to 1. For example, `"size": [0.30, 0.15]` makes the box 30% of the displayed page width and 15% of its height. The `point` field locates the upper-left corner. Both measurements follow the displayed page’s crop and rotation. The full `text` travels even when only a few lines fit. Font preferences come from the receiving browser.

Importing a matching note ID updates its box. Importing a compact note with the same ID removes its saved size. Once all notes are compact again, Margin exports the lowest version needed for the other marks.

## Version 6 and region notes

Every region is a single `region` entry with a required `point`, `size`, nonempty `text`, and the usual ID, page and color. The optional `done` field carries its action checkbox. For example, in the sample above, change the version to 6, change the type to `"region"`, and add `"size": [0.20, 0.12]` beside `point`. This outlines an area starting 65% across and 40% down the displayed page, spanning 20% of its width and 12% of its height. Both dimensions must be positive and the rectangle must fit on the page.

The rectangle identifies the area you commented on. The JSON carries your words and the area’s coordinates. To see the diagram or scan inside it, open the matching source PDF. Importing the same ID updates the existing region. Documents without regions continue to use the lowest format version their marks require.

Converting a point note to a region keeps its ID, page, color, text and action status. Its exported type becomes `region` and its `size` describes the outline. Converting back produces a compact `note` and omits `size`. Import either export onto the same PDF to update the matching note in place. Margin still chooses the lowest format version needed by all marks in the file.

## Version 7 and margin placement

Choose **Left margin** or **Right margin** under **Margin placement** when editing a note. Its JSON entry gains `"marginSide": "left"` or `"marginSide": "right"`. This optional field applies to point notes, region notes, and passage comments. A multi-page comment uses one side for every quoted page. Its original position, text, and ID travel with it.

Margin writes version 7 whenever any note uses a margin. Importing a matching ID with a different side moves the note. Importing a matching ID without `marginSide` restores **No margin copy**. Once all notes use **No margin copy**, Margin writes the earliest format that supports the document’s remaining marks.

All seven versions accept only the documented fields for the envelope and mark type. Imports accept files up to 16 MiB. The resulting draft must fit Margin’s existing limits of 2,000 marks, 100,000 geometry entries and 2,000,000 UTF-16 code units of annotation text. The editor also checks its encoded annotation size limits of 8 MiB per mark and 32 MiB per document.
