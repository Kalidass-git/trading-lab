package com.tradinglab.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Two things an Android WebView cannot do on its own:
 *  - print(): window.print() does nothing in a WebView, so the report would never reach "Save as PDF".
 *  - shareFile(): downloads of generated files (backups, CSV) do not work in a WebView, so the file is saved
 *    in the app's cache and handed to Android's share sheet (save to Drive, send on WhatsApp, and so on).
 */
@CapacitorPlugin(name = "NativeTools")
public class NativeToolsPlugin extends Plugin {

    /**
     * Status and navigation bar icons that can be read on the page's real colour.
     * dark=true means a dark page, so the clock, battery and signal icons are drawn light.
     * color (optional "#rrggbb") is painted behind the bars, so the strip matches the page even when the app's own
     * light/dark setting differs from the phone's.
     */
    @PluginMethod
    public void setBars(final PluginCall call) {
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        final String color = call.getString("color");
        getActivity().runOnUiThread(() -> {
            try {
                android.view.Window w = getActivity().getWindow();
                if (color != null) w.setBackgroundDrawable(new ColorDrawable(Color.parseColor(color)));
                WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(w, w.getDecorView());
                ic.setAppearanceLightStatusBars(!dark);
                ic.setAppearanceLightNavigationBars(!dark);
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not set the system bars: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void print(final PluginCall call) {
        final String title = call.getString("title", "Trading Lab");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter(title);
                pm.print(title, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not open the print dialog: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        String mime = call.getString("mime", "application/octet-stream");
        if (name == null || data == null) {
            call.reject("A file name and its contents are needed.");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Could not prepare a folder for the file.");
                return;
            }
            // Old exports are not kept: they hold private numbers.
            File[] old = dir.listFiles();
            if (old != null) {
                for (File f : old) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
            File file = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not share the file: " + e.getMessage());
        }
    }
}
