package app.simplebiblememory.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import app.simplebiblememory.R;

/** The number of verses memorized, big, and (when there is room) the pie of card stages from the Statistics screen. Tapping opens Statistics. */
public class StatsWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle options) {
        update(context, manager, id);
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        int[] size = WidgetData.sizeDp(manager, id, 110, 110);
        manager.updateAppWidget(id, views(context, size[0], size[1]));
    }

    static RemoteViews views(Context context, int widthDp, int heightDp) {
        WidgetData.Palette p = WidgetData.Palette.current(context);
        JSONObject stats = WidgetData.load(context).optJSONObject("stats");
        // A one-row widget has its own layout (a small one-line label, and the number as big as the rest of the height allows); taller ones scale everything.
        // The pie sits beside the number, so only a wide widget has it; it shrinks to fit a short one, and a square one is just the number.
        boolean room = widthDp >= 160 && heightDp >= 52 && widthDp >= heightDp * 1.45; // a 3x2 widget is about 180 x 110
        // With the pie the number and its words are left-aligned (beside the pie); without it they sit in the middle.
        boolean shortWidget = heightDp < 110;
        int layout = shortWidget ? (room ? R.layout.widget_stats_short : R.layout.widget_stats_short_center) : (room ? R.layout.widget_stats : R.layout.widget_stats_center);
        RemoteViews v = new RemoteViews(context.getPackageName(), layout);
        v.setInt(R.id.widget_bg, "setColorFilter", p.surface);
        v.setInt(R.id.widget_ring, "setColorFilter", p.border);
        v.setTextViewText(R.id.stats_number, String.valueOf(stats == null ? 0 : stats.optInt("memorized", 0)));
        v.setTextColor(R.id.stats_number, p.foreground);
        v.setTextViewText(R.id.stats_label, WidgetData.label(context, "memorized", context.getString(R.string.widget_memorized)));
        v.setTextColor(R.id.stats_label, p.muted);
        v.setOnClickPendingIntent(R.id.widget_root, AddCardWidget.open(context, "simplebiblememory://stats", 40));

        // A short widget (one row of the home screen): a smaller label on one line, so the number can use the height.
        // The room around the content: about 16dp above and below like the other widgets, a little less when the widget is only one row high.
        float d = context.getResources().getDisplayMetrics().density;
        int padDp = Math.round(Math.max(6, Math.min(16, heightDp * 0.17f)));
        int sideDp = 16;
        v.setViewPadding(R.id.stats_content, (int) (sideDp * d), (int) (padDp * d), (int) (sideDp * d), (int) (padDp * d));

        v.setViewVisibility(R.id.stats_pie, room ? View.VISIBLE : View.GONE);
        if (room) {
            // The pie is as big as the height allows, but never more than about a third of the width (so the words keep their room), and the gap
            // to the words grows with the pie.
            float availH = heightDp - 8 - 2 * padDp;
            // As big as the height allows, up to 150dp, but the words keep at least about 70dp of width (so "memorized" is never cut or broken).
            int gapMax = heightDp < 110 ? 16 : 28;
            float byWidth = Math.max(widthDp * 0.30f, widthDp - 40 - gapMax - 70);
            float pieDp = Math.max(24, Math.min(150, Math.min(availH, byWidth)));
            int pieV = Math.max(0, Math.round((availH - pieDp) / 2f));
            int gap = Math.round(Math.max(10, Math.min(gapMax, pieDp * 0.30f + 4))); // a small pie sits closer to its words
            v.setViewPadding(R.id.stats_pie, 0, (int) (pieV * d), (int) (gap * d), (int) (pieV * d));
            JSONObject c = stats == null ? null : stats.optJSONObject("counts");
            int[] counts = c == null ? new int[4] : new int[] { c.optInt("new"), c.optInt("learning"), c.optInt("young"), c.optInt("mature") };
            boolean dark = WidgetData.isDark(p.background);
            // The slice colours of the Statistics screen: new, learning (the accent), young, mature.
            int[] colors = { WidgetData.mix(p.foreground, dark ? 22 : 34, p.background), p.accent, WidgetData.mix(p.foreground, 55, p.background), p.foreground };
            v.setImageViewBitmap(R.id.stats_pie, PieChart.draw(400, counts, colors, p.border, p.surface));
        }
        return v;
    }
}
