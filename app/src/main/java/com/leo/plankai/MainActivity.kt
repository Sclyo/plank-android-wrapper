package com.leo.plankai

import android.Manifest
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    // --- runtime camera permission launcher ---
    private val requestCameraPerm = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val event = if (granted) "camera-permission-granted" else "camera-permission-denied"
        if (this::webView.isInitialized) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('$event'))", null)
        }
    }

    private fun ensureCameraPermission() {
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('camera-permission-granted'))",
                null
            )
        } else {
            requestCameraPerm.launch(Manifest.permission.CAMERA)
        }
    }

    // --- JS bridge to control orientation / screen-on from web routes ---
    private class AndroidBridge(private val activity: AppCompatActivity) {
        @JavascriptInterface
        fun onRoute(hash: String) {
            activity.runOnUiThread {
                val isCoaching = hash.startsWith("#/coaching")
                if (isCoaching) {
                    activity.requestedOrientation =
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    activity.requestedOrientation =
                        ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)

        WebView.setWebContentsDebuggingEnabled(true)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            // allow file:// page to load file:// assets
            setAllowFileAccessFromFileURLs(true)
            setAllowUniversalAccessFromFileURLs(true)
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        // grant camera/mic for file:// origin
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val wantsVideo =
                        request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    val wantsAudio =
                        request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if ((wantsVideo || wantsAudio) &&
                        (request.origin?.toString()?.startsWith("file://") == true)
                    ) {
                        request.grant(
                            arrayOf(
                                PermissionRequest.RESOURCE_VIDEO_CAPTURE,
                                PermissionRequest.RESOURCE_AUDIO_CAPTURE
                            )
                        )
                    } else {
                        request.deny()
                    }
                }
            }
        }

        // inject route watcher after page loads + request camera
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                ensureCameraPermission()
                webView.evaluateJavascript(
                    """
                    (function(){
                      function report(){
                        try { AndroidBridge.onRoute(location.hash || '#/'); } catch(e){}
                      }
                      window.addEventListener('hashchange', report);
                      document.addEventListener('visibilitychange', report);
                      report();
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }
        webView.evaluateJavascript(
            """
    (function () {
      // Only act on the home screen
      var h = location.hash || '#/';
      if (h === '#/' || h === '') {
        function go() { location.hash = '#/setup'; }
        // On first user interaction anywhere, jump to setup
        function onFirstTap() {
          document.removeEventListener('pointerup', onFirstTap, true);
          go();
        }
        document.addEventListener('pointerup', onFirstTap, true);
      }
    })();
    """.trimIndent(),
            null
        )



        // expose the bridge to JS
        webView.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")

        // load the built web app
        webView.loadUrl("file:///android_asset/www/public/index.html")
    }

    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
