package io.github.vollero.margin

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.webkit.*
import android.widget.TextView
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream

private const val ORIGIN = "https://appassets.androidplatform.net"
private const val OPEN = 30
private const val SAVE = 31
private const val MAX_EXPORT = 268435456L

class ReaderActivity : Activity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var spool: File? = null
    private var stream: FileOutputStream? = null
    private var size = 0L
    private var written = 0L
    private var exportName = ""
    private var mime = ""
    private var pickerOpen = false
    private var copying = false
    private var penSamples = 0L
    private var low = Float.POSITIVE_INFINITY
    private var high = 0f
    private var buttons = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val version = WebView.getCurrentWebViewPackage()?.versionName.orEmpty()
        if ((version.substringBefore('.').toIntOrNull() ?: 0) < 141) {
            setContentView(TextView(this).apply { text = "Update Android System WebView or Chrome to version 141 or later, then reopen Margin." })
            return
        }
        cacheDir.listFiles()?.filter { it.name.startsWith("margin-export-") }?.forEach { it.delete() }
        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val response = assets.shouldInterceptRequest(request.url)
                    ?: return WebResourceResponse("text/plain","utf-8",403,"Forbidden", emptyMap(),ByteArrayInputStream(byteArrayOf()))
                if (request.url.path?.endsWith(".mjs")==true) response.mimeType="application/javascript"
                if (request.url.path?.endsWith(".wasm")==true) response.mimeType="application/wasm"
                response.responseHeaders = mapOf("Content-Security-Policy" to "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'")
                return response
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url=request.url
                if(request.isForMainFrame && request.hasGesture() && url.scheme in listOf("http","https") && url.host!="appassets.androidplatform.net") {
                    try { startActivity(Intent(Intent.ACTION_VIEW,url)) } catch (_:ActivityNotFoundException) {}
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view:WebView, callback:ValueCallback<Array<Uri>>, params:FileChooserParams):Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback=callback
                val accept=params.acceptTypes.joinToString(",")
                val type=if(accept.contains("pdf")) "application/pdf" else "*/*"
                try { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type),OPEN) }
                catch (_:ActivityNotFoundException) { fileCallback=null;callback.onReceiveValue(null) }
                return true
            }
        }
        web.addJavascriptInterface(Bridge(),"MarginAndroid")
        web.setOnApplyWindowInsetsListener { view, insets ->
            val padding=insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            view.setPadding(padding.left,padding.top,padding.right,padding.bottom)
            insets
        }
        setContentView(web)
        web.loadUrl("$ORIGIN/assets/index.html")
    }

    override fun dispatchTouchEvent(e:MotionEvent):Boolean {
        for(i in 0 until e.pointerCount) if(e.getToolType(i)==MotionEvent.TOOL_TYPE_STYLUS) {
            penSamples++;buttons=buttons or e.buttonState
            if(e.getPressure(i)>0) {low=minOf(low,e.getPressure(i));high=maxOf(high,e.getPressure(i))}
        }
        return super.dispatchTouchEvent(e)
    }

    inner class Bridge {
        @JavascriptInterface fun penReport() { runOnUiThread {
            AlertDialog.Builder(this@ReaderActivity).setTitle("Pen diagnostics")
                .setMessage("Model: "+android.os.Build.MODEL+"\nAndroid: "+android.os.Build.VERSION.RELEASE+
                    "\nWebView: "+WebView.getCurrentWebViewPackage()?.versionName+"\nPen events: "+penSamples+
                    "\nContact pressure: "+(if(low.isFinite()) low.toString() else "—")+" to "+high+
                    "\nObserved button mask: "+buttons).setPositiveButton("Close",null).show()
        } }
        @JavascriptInterface fun beginSave(name:String,type:String,bytes:Long):Boolean = synchronized(this@ReaderActivity) {
            if(spool!=null || bytes !in 1..MAX_EXPORT) return@synchronized false
            try {
                spool=File.createTempFile("margin-export-",null,cacheDir)
                stream=FileOutputStream(spool)
                size=bytes;written=0;exportName=name.substringAfterLast('/').take(160)
                mime=when(type) {"application/pdf","application/json"->type;else->"application/octet-stream"}
                true
            } catch (_:Exception) { clean();false }
        }
        @JavascriptInterface fun appendSave(chunk:String):Boolean = synchronized(this@ReaderActivity) {
            if(chunk.length>44000 || stream==null) return@synchronized false
            try {
                val bytes=Base64.decode(chunk,Base64.NO_WRAP)
                if(written+bytes.size>size) return@synchronized false
                stream!!.write(bytes);written+=bytes.size;true
            } catch (_:Exception) { false }
        }
        @JavascriptInterface fun cancelSave() { synchronized(this@ReaderActivity){ if(!pickerOpen && !copying)clean() } }
        @JavascriptInterface fun chooseDestination() { runOnUiThread {
            if(pickerOpen || copying) return@runOnUiThread
            try {
                check(spool!=null && written==size)
                stream?.close();stream=null;pickerOpen=true
                startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime).putExtra(Intent.EXTRA_TITLE,exportName),SAVE)
            } catch (_:Exception) { finishSave(false,"Could not open the save picker.") }
        } }
    }
    @Synchronized private fun clean() {
        try {stream?.close()} catch (_:Exception) {}
        stream=null;spool?.delete();spool=null;pickerOpen=false;copying=false
    }
    private fun finishSave(ok:Boolean,message:String) {
        clean()
        if(!isDestroyed) web.evaluateJavascript("marginSaveResult("+ok+","+JSONObject.quote(message)+")",null)
    }
    @Deprecated("Activity result callback")
    override fun onActivityResult(code:Int,result:Int,intent:Intent?) {
        super.onActivityResult(code,result,intent)
        val uri=intent?.data?.takeIf {result==RESULT_OK && it.scheme=="content"}
        if(code==OPEN) {fileCallback?.onReceiveValue(uri?.let { arrayOf(it) });fileCallback=null}
        if(code==SAVE && spool!=null) {
            pickerOpen=false
            if(uri==null) {finishSave(false,"Canceled");return}
            val source=spool!!
            copying=true
            Thread {
                val ok=try {
                    source.inputStream().use { input -> requireNotNull(contentResolver.openOutputStream(uri,"wt")).use { output -> input.copyTo(output)==size } }
                } catch (_:Exception) { false }
                runOnUiThread {finishSave(ok,if(ok) "" else "Export could not be written. Choose another destination.")}
            }.start()
        }
    }
    override fun onDestroy() {
        fileCallback?.onReceiveValue(null);fileCallback=null
        if(!copying)clean()
        if(::web.isInitialized){ web.removeJavascriptInterface("MarginAndroid");web.destroy() }
        super.onDestroy()
    }
    @Deprecated("System Back")
    override fun onBackPressed() {
        if(!::web.isInitialized){super.onBackPressed();return}
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;if(d.id==='book-dialog')document.getElementById('book-close').click();else d.close();return true})()") {
            if(it!="true") moveTaskToBack(true)
        }
    }
}
