# Write a derivation alongside a PDF

Margin for Android opens a PDF from the tablet’s file picker and keeps a local draft. The writing area is a paged notebook attached to a point, passage or region in that PDF. Each notebook can have its own title, tags and paper.

## Install the development build

1. Use a tablet running **Android 12 or later** with **Android System WebView 141 or later**. Open the latest successful **Android tablet build** on GitHub. Sign in, scroll to **Artifacts**, and download **margin-android-development**. [Android builds](https://github.com/vollero/pdf-annotator/actions/workflows/android.yml)
2. Extract the ZIP, open **app-debug.apk** on the tablet, and allow installation from the app you used to open it if Android prompts you.
3. Launch **Margin**. The bundled *Reading the Alps* PDF works offline. Tap **Open PDF** to choose your own document. Android grants access to the file you choose.

The development package uses the ID `io.github.vollero.margin.dev`. CI can sign successive development builds with different keys. Before uninstalling or changing builds, use **Export annotations** and keep the original PDF. Uninstalling clears the app’s drafts. A signed pilot release uses the separate ID `io.github.vollero.margin` and has its own workspace.

## Start a handwritten notebook

1. Tap **Note** and then the relevant spot on the PDF. For an equation or figure, choose **Region** and drag a box. For a passage, use **Select**, select the text, and choose **Comment**.
2. Enter a title, for example *Derivation of the boundary condition*. Add an author or tags if useful, then tap **Save and open notebook**. You can also open a previously saved note and give it a notebook.
3. In landscape, the source page and its marked location appear beside the writing surface. Adjust **Source width** or the writing **Zoom**. Portrait gives the notebook the available width. **Go to source** returns to the marked passage or location.
4. Write with the pen. Select a color or line width. **Highlighter** uses translucent ink. **Stroke eraser** removes a whole stroke. With **Finger ink** off, use fingers to pan and pinch the writing area. Turn it on to write with a finger. On a desktop, use the mouse or a stylus.
5. Wait for **Page saved** before closing the app. Return through the annotation’s **Open notebook** button. The app remembers the last notebook page. **Title and tags** opens the linked comment, where you can edit its details.

### Work on a long calculation or text

- Under **Page actions**, add a page at the end, insert before the current page, duplicate a diagram, reorder a page, or delete one. The last page stays in the notebook. Each page can have **grid**, **ruled** or **blank** paper.
- Jump by typing a page number or opening **Page thumbnails**. Use **Previous** and **Next** to read through the work in order.
- Choose **Lasso** and draw around the strokes representing a term or line of text. Drag from the selected ink to move it. **Copy selection**, change pages and tap **Paste** to reuse it. **Delete selection** removes it. **Undo ink** walks back recent edits to the page while the notebook is open.
- Enable **Timeline → Recorded drafts → Record future drafts on this device** before writing if you want to revisit earlier handwriting. Choose a recorded draft and its notebook, then tap **Read recorded notebook**. The preview opens the pages as saved at that time. Recording retains up to 50 local drafts per document.
- One notebook holds up to 256 pages. Each page accepts up to 10,000 strokes and 150,000 sampled points. Split a particularly dense derivation across pages. If a local save fails, keep the notebook open and use **Save page PDF** to preserve a readable copy or **Retry page save**.

## Share or move your work

| What you need | What to choose |
| --- | --- |
| Continue writing on another device | **Annotations → Export annotations** creates a `.marginbook` when the document has a notebook. Open the exact same source PDF in the Android app or desktop Margin 0.5.0-rc.1 and use **Import annotations**. |
| Give someone a printable derivation | In **Export notebooks**, select one or more titles and choose **Save selected as PDF**. **Save page PDF** exports just the displayed sheet. The heading identifies the source file and PDF page. |
| Send the annotated source PDF | Choose **Export PDF** in the main workspace. It includes visible source-page marks and notebook anchor comments. Export the handwritten pages separately for readers who need them. |

Annotation migration includes editable strokes, pressure, page order, paper, comment metadata and other annotations. The SHA-256 check uses the original PDF bytes. A renamed copy works. When both devices edit the same notebook page independently, import keeps both editions. Open **Page thumbnails** to find the conflict copy, review the two and delete the one you no longer need. [Migration details](annotation-migration.md#format-13-and-handwritten-notebooks)

## Try the Xiaomi Focus Pen

In a notebook, make several slow strokes from light to firm pressure. Try hovering, holding each pen button while touching the sheet and resting your palm while writing. Open **Pen diagnostics** to see what Android and the editor each received on that particular tablet and OS build. The readings stay on-device. When the editor actually receives a pen button, a **Pen button** menu appears. Assign **Stroke eraser**, **Highlighter** or **Lasso**, then hold that button as you begin another stroke.

Android or HyperOS can consume a button before the app receives it. Use the on-screen tools for that configuration. Physical acceptance on the Pad 7 Pro includes verifying light/heavy strokes, buttons, palm contact, accuracy at high zoom, and sustained writing through a long notebook. Automated tests cover file exchange and editor behavior. Hardware latency and Focus Pen button delivery require a device measurement.

## Build locally

Use Node.js 24, JDK 17, an Android SDK with platform 35 and an Android 12+ device or emulator. Run these commands from the repository root.

```sh
npm ci --ignore-scripts
npm run build
cd android
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The Android app bundles the same editor, PDF rendering assets and license notices as the extension. Opening, writing and exporting require no network permission. With a source open, you can edit in airplane mode and save through the Android document picker.

For a public pilot, maintainers use a backed-up release key. Configure the GitHub Actions secrets `MARGIN_KEYSTORE_BASE64`, `MARGIN_STORE_PASSWORD`, `MARGIN_KEY_ALIAS` and `MARGIN_KEY_PASSWORD`. For a local release build, set `MARGIN_KEYSTORE` to the absolute path to the same keystore and supply the three signing variables. The Android tag workflow runs the emulator test, verifies the desktop companion release exists and verifies the APK signature before publishing.
