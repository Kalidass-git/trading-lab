package com.tradinglab.app;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own small plugin (print to PDF and share a file). It must be registered before super.onCreate.
        registerPlugin(NativeToolsPlugin.class);
        super.onCreate(savedInstanceState);
        // Draw behind the system bars; Capacitor's SystemBars plugin keeps the page clear of them.
        // This must come AFTER super.onCreate: calling it first builds the window with the launch theme (which still has a title bar)
        // before Capacitor switches to the no-title-bar theme, and a green "Trading Lab" bar showed above the page.
        EdgeToEdge.enable(this);
        // Belt and braces: never show an Android title / action bar.
        if (getSupportActionBar() != null) getSupportActionBar().hide();
        // The launch splash picture stays as the window background and shows through any strip the page does not cover
        // (it looked like a squashed banner above the header). Use the app's own plain colour instead.
        getWindow().setBackgroundDrawableResource(R.color.window_bg);
        // Text size is set inside the app (Aa button, Settings). Without this, Android's system font size is applied on top of it.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
