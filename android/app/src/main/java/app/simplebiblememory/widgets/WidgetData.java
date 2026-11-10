package app.simplebiblememory.widgets;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;

import org.json.JSONObject;

/**
 * What the app hands to the home-screen widgets: one JSON snapshot (colours, wording, and what each widget shows), saved when the
 * app changes something. The widgets can't read the app's database (it lives inside the web view), so they only ever draw this.
 * Without a snapshot (the app has not been opened yet) they draw sensible defaults in the app's own paper-and-rose look.
 */
public final class WidgetData {
    private static final String FILE = "widget_snapshot";
    private static final String KEY = "snapshot";

    private WidgetData() {}

    public static void save(Context context, String json) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    /** The saved snapshot, or an empty one. */
    public static JSONObject load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
        try {
            return new JSONObject(prefs.getString(KEY, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** Asks every widget on the home screen to draw itself again. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> provider : new Class<?>[] { AddCardWidget.class }) {
            ComponentName name = new ComponentName(context, provider);
            int[] ids = manager.getAppWidgetIds(name);
            if (ids.length == 0) continue;
            Intent intent = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).setComponent(name);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(intent);
        }
    }

    /** The colours the widgets use: the app's theme (light, dark or the person's own colours), as the app last saved it. */
    public static final class Palette {
        public final int background, foreground, muted, surface, border, accent, primary, primaryForeground;

        private Palette(JSONObject o, Palette fallback) {
            background = color(o, "background", fallback.background);
            foreground = color(o, "foreground", fallback.foreground);
            muted = color(o, "muted", fallback.muted);
            surface = color(o, "surface", fallback.surface);
            border = color(o, "border", fallback.border);
            accent = color(o, "accent", fallback.accent);
            primary = color(o, "primary", fallback.primary);
            primaryForeground = color(o, "primaryForeground", fallback.primaryForeground);
        }

        private Palette(int background, int foreground, int muted, int surface, int border, int accent, int primary, int primaryForeground) {
            this.background = background; this.foreground = foreground; this.muted = muted; this.surface = surface;
            this.border = border; this.accent = accent; this.primary = primary; this.primaryForeground = primaryForeground;
        }

        // The app's tokens (src/styles/tokens.css).
        static final Palette LIGHT = new Palette(0xFFF8F8F6, 0xFF17171A, 0xFF5E5E5A, 0xFFEEEEEA, 0xFFD9D8D3, 0xFFD96878, 0xFF17171A, 0xFFF8F8F6);
        static final Palette DARK = new Palette(0xFF131312, 0xFFF1F0EC, 0xFFA4A29B, 0xFF1D1D1B, 0xFF333330, 0xFFD96878, 0xFFF1F0EC, 0xFF131312);

        private static int color(JSONObject o, String key, int fallback) {
            try { return Color.parseColor(o.getString(key)); } catch (Exception e) { return fallback; }
        }

        /** The palette to draw with right now: the person's choice in the app; "system" follows the phone's light or dark setting. */
        public static Palette current(Context context) {
            JSONObject theme = load(context).optJSONObject("theme");
            boolean phoneDark = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            String pref = theme == null ? "system" : theme.optString("pref", "system");
            String key = "custom".equals(pref) ? "custom" : "dark".equals(pref) || ("system".equals(pref) && phoneDark) ? "dark" : "light";
            Palette base = "dark".equals(key) ? DARK : LIGHT;
            JSONObject colors = theme == null ? null : theme.optJSONObject(key);
            return colors == null ? base : new Palette(colors, base);
        }
    }

    /** WCAG contrast ratio between two colours (1 to 21). */
    static double contrast(int a, int b) {
        double la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    private static double luminance(int c) {
        double[] rgb = { Color.red(c) / 255.0, Color.green(c) / 255.0, Color.blue(c) / 255.0 };
        for (int i = 0; i < 3; i++) rgb[i] = rgb[i] <= 0.03928 ? rgb[i] / 12.92 : Math.pow((rgb[i] + 0.055) / 1.055, 2.4);
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    /** Whichever of the two colours is easier to read on `background`. */
    public static int readableOn(int background, int first, int second) {
        return contrast(background, first) >= contrast(background, second) ? first : second;
    }

    /** A word or phrase the app saved in the person's language; the widget's own English default until there is one. */
    public static String label(Context context, String key, String fallback) {
        JSONObject labels = load(context).optJSONObject("labels");
        String value = labels == null ? "" : labels.optString(key, "");
        return value.isEmpty() ? fallback : value;
    }
}
