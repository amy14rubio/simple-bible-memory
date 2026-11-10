package app.simplebiblememory.widgets;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.FrameLayout;

import java.io.File;
import java.io.FileOutputStream;

import app.simplebiblememory.R;

/**
 * Debug only. Draws the widget picker's preview layouts to PNG files (the pictures older phones show in the picker; res/drawable-nodpi/
 * widget_preview_*.png): `adb shell am start -n app.simplebiblememory.debug/app.simplebiblememory.widgets.PreviewExportActivity`, then
 * `adb pull /sdcard/Android/data/app.simplebiblememory.debug/files/preview`.
 */
public class PreviewExportActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Light and dark: the pictures older phones show in the picker (the dark ones go in drawable-night-nodpi).
        for (boolean night : new boolean[] { false, true }) {
            File dir = new File(getExternalFilesDir(null), night ? "preview-night" : "preview");
            dir.mkdirs();
            android.content.res.Configuration config = new android.content.res.Configuration(getResources().getConfiguration());
            config.uiMode = (config.uiMode & ~android.content.res.Configuration.UI_MODE_NIGHT_MASK) | (night ? android.content.res.Configuration.UI_MODE_NIGHT_YES : android.content.res.Configuration.UI_MODE_NIGHT_NO);
            android.content.Context themed = createConfigurationContext(config);
            export(themed, dir, "add_card", R.layout.widget_preview_add_card, 176, 60);
            export(themed, dir, "due_decks", R.layout.widget_preview_due_decks, 320, 200);
            export(themed, dir, "stats", R.layout.widget_preview_stats, 150, 150);
            export(themed, dir, "verse", R.layout.widget_preview_verse, 320, 130);
        }
        // The real widgets, with the snapshot the app last saved (to look at how they are drawn at a few sizes).
        File live = new File(getExternalFilesDir(null), "live");
        live.mkdirs();
        exportViews(live, "stats_square", StatsWidget.views(this, 150, 150), 150, 150);
        exportViews(live, "stats_wide", StatsWidget.views(this, 360, 140), 360, 140);
        exportViews(live, "due", DueDecksWidget.views(this, 170), 360, 170);
        exportViews(live, "due_tall", DueDecksWidget.views(this, 300), 360, 300);
        exportViews(live, "due_short", DueDecksWidget.views(this, 80), 360, 80);
        // A grid of sizes, to check the Statistics widget everywhere (m_<width>x<height>).
        for (int w : new int[] { 110, 180, 287 }) for (int h : new int[] { 56, 72, 93, 109, 150, 190 }) exportViews(live, "m_" + w + "x" + h, StatsWidget.views(this, w, h), w, h);
        exportViews(live, "stats_wide_short", StatsWidget.views(this, 360, 72), 360, 72);
        exportViews(live, "stats_wide_mid", StatsWidget.views(this, 360, 100), 360, 100);
        exportViews(live, "stats_big", StatsWidget.views(this, 360, 300), 360, 300);
        exportViews(live, "stats_big_square", StatsWidget.views(this, 300, 300), 300, 300);
        exportViews(live, "stats_3x2", StatsWidget.views(this, 180, 110), 180, 110);
        exportViews(live, "stats_3x2b", StatsWidget.views(this, 200, 120), 200, 120);
        exportViews(live, "stats_short", StatsWidget.views(this, 150, 72), 150, 72);
        exportViews(live, "stats_square2", StatsWidget.views(this, 150, 120), 150, 120);
        exportViews(live, "verse", VersePreviewWidget.views(this, 0, 150), 360, 150);
        finish();
    }

    private void exportViews(File dir, String name, android.widget.RemoteViews views, int widthDp, int heightDp) {
        FrameLayout holder = new FrameLayout(this);
        holder.addView(views.apply(this, holder));
        int wPx = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, widthDp, getResources().getDisplayMetrics());
        int hPx = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, heightDp, getResources().getDisplayMetrics());
        holder.measure(View.MeasureSpec.makeMeasureSpec(wPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hPx, View.MeasureSpec.EXACTLY));
        holder.layout(0, 0, wPx, hPx);
        Bitmap bitmap = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        holder.draw(new Canvas(bitmap));
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        } catch (Exception ignored) { }
    }

    private void export(android.content.Context context, File dir, String name, int layout, int widthDp, int heightDp) {
        float scale = 3f;
        int w = (int) (widthDp * scale), h = (int) (heightDp * scale);
        FrameLayout holder = new FrameLayout(context);
        View view = LayoutInflater.from(context).inflate(layout, holder, false);
        holder.addView(view);
        // Draw at 3x by scaling the canvas (the layout itself is laid out at its dp size).
        int wPx = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, widthDp, getResources().getDisplayMetrics());
        int hPx = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, heightDp, getResources().getDisplayMetrics());
        holder.measure(View.MeasureSpec.makeMeasureSpec(wPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hPx, View.MeasureSpec.EXACTLY));
        holder.layout(0, 0, wPx, hPx);
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale((float) w / wPx, (float) h / hPx);
        holder.draw(canvas);
        try (FileOutputStream out = new FileOutputStream(new File(dir, "widget_preview_" + name + ".png"))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        } catch (Exception ignored) { }
    }
}
