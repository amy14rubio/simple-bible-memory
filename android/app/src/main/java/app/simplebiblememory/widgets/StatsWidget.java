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
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_stats);
        v.setInt(R.id.widget_bg, "setColorFilter", p.surface);
        v.setInt(R.id.widget_ring, "setColorFilter", p.border);
        v.setTextViewText(R.id.stats_number, String.valueOf(stats == null ? 0 : stats.optInt("memorized", 0)));
        v.setTextColor(R.id.stats_number, p.foreground);
        v.setTextViewText(R.id.stats_label, WidgetData.label(context, "memorized", context.getString(R.string.widget_memorized)));
        v.setTextColor(R.id.stats_label, p.muted);
        v.setOnClickPendingIntent(R.id.widget_root, AddCardWidget.open(context, "simplebiblememory://stats", 40));

        boolean room = widthDp >= 190 && heightDp >= 100;
        v.setViewVisibility(R.id.stats_pie, room ? View.VISIBLE : View.GONE);
        if (room) {
            JSONObject c = stats == null ? null : stats.optJSONObject("counts");
            int[] counts = c == null ? new int[4] : new int[] { c.optInt("new"), c.optInt("learning"), c.optInt("young"), c.optInt("mature") };
            boolean dark = WidgetData.isDark(p.background);
            // The slice colours of the Statistics screen: new, learning (the accent), young, mature.
            int[] colors = { WidgetData.mix(p.foreground, dark ? 22 : 34, p.background), p.accent, WidgetData.mix(p.foreground, 55, p.background), p.foreground };
            v.setImageViewBitmap(R.id.stats_pie, PieChart.draw(260, counts, colors, p.border, p.surface));
        }
        return v;
    }
}
