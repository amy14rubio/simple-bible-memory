package app.simplebiblememory.widgets;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RemoteViews;
import android.widget.ScrollView;
import android.widget.TextView;

/** Debug only. Shows every widget at a typical launcher size on a plain "wallpaper": `adb shell am start -n app.simplebiblememory/.widgets.WidgetPreviewActivity --es bg "#8FA8B8"`. */
public class WidgetPreviewActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String bg = getIntent().getStringExtra("bg");
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor(bg == null ? "#8FA8B8" : bg));
        root.setPadding(dp(16), dp(48), dp(16), dp(16));
        show(root, "Add card · 2×1", AddCardWidget.views(this), 176, 56);
        show(root, "Due today · 4×2", DueDecksWidget.views(this, 140), 360, 140);
        show(root, "Statistics · 2×2", StatsWidget.views(this, 110, 110), 150, 150);
        show(root, "Statistics · 4×2", StatsWidget.views(this, 250, 120), 360, 140);
        show(root, "Verse preview · 4×2", VersePreviewWidget.views(this, 0, 140), 360, 140);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    private void show(LinearLayout parent, String title, RemoteViews views, int widthDp, int heightDp) {
        TextView label = new TextView(this);
        label.setText(title);
        label.setTextColor(Color.WHITE);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        label.setPadding(0, dp(14), 0, dp(4));
        parent.addView(label);
        FrameLayout slot = new FrameLayout(this);
        slot.addView(views.apply(this, slot), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        parent.addView(slot, new LinearLayout.LayoutParams(dp(widthDp), dp(heightDp)));
    }

    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
}
