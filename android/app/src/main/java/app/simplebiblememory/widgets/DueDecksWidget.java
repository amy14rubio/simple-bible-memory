package app.simplebiblememory.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.simplebiblememory.R;

/** "Due today": the decks, with how many cards are due in each. Tapping a deck opens it. */
public class DueDecksWidget extends AppWidgetProvider {
    private static final int[] ROW = { R.id.due_row1, R.id.due_row2, R.id.due_row3, R.id.due_row4, R.id.due_row5 };
    private static final int[] NAME = { R.id.due_name1, R.id.due_name2, R.id.due_name3, R.id.due_name4, R.id.due_name5 };
    private static final int[] LINE = { R.id.due_line1, R.id.due_line2, R.id.due_line3, R.id.due_line4, R.id.due_line5 };
    private static final int[] COUNT = { R.id.due_count1, R.id.due_count2, R.id.due_count3, R.id.due_count4, R.id.due_count5 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle options) {
        update(context, manager, id); // resized: show as many decks as now fit
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        int[] size = WidgetData.sizeDp(manager, id, 250, 110);
        manager.updateAppWidget(id, views(context, size[1]));
    }

    static RemoteViews views(Context context, int heightDp) {
        WidgetData.Palette p = WidgetData.Palette.current(context);
        JSONObject snapshot = WidgetData.load(context);
        JSONArray decks = snapshot.optJSONArray("decks");
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_due_decks);
        v.setInt(R.id.widget_bg, "setColorFilter", p.surface);
        v.setInt(R.id.widget_ring, "setColorFilter", p.border);
        v.setInt(R.id.due_badge, "setColorFilter", p.accent);
        v.setTextColor(R.id.due_total, WidgetData.readableOn(p.accent, p.background, p.foreground));
        v.setTextViewText(R.id.due_title, WidgetData.label(context, "dueToday", context.getString(R.string.widget_due_today)));
        v.setTextColor(R.id.due_title, p.foreground);
        v.setTextColor(R.id.due_more, p.muted);
        v.setTextColor(R.id.due_empty, p.muted);
        v.setOnClickPendingIntent(R.id.widget_root, AddCardWidget.open(context, "simplebiblememory://home", 20));

        int count = decks == null ? 0 : decks.length();
        for (int r : ROW) v.setViewVisibility(r, View.GONE);
        v.setViewVisibility(R.id.due_more, View.GONE);
        v.setViewVisibility(R.id.due_empty, View.GONE);
        if (count == 0) {
            v.setTextViewText(R.id.due_total, "");
            v.setViewVisibility(R.id.due_empty, View.VISIBLE);
            v.setTextViewText(R.id.due_empty, WidgetData.label(context, "noDecks", context.getString(R.string.widget_no_decks)));
            return v;
        }

        // Decks with cards due come first (in the app's order), then the rest.
        int total = 0;
        int[] order = new int[count];
        int n = 0;
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < count; i++) {
                int due = decks.optJSONObject(i).optInt("due", 0);
                if ((pass == 0) == (due > 0)) order[n++] = i;
                if (pass == 0) total += due;
            }
        }
        v.setTextViewText(R.id.due_total, total > 0 ? String.valueOf(total) : "✓");

        // As many decks as fit. "+N more" takes the space of a row only when there are three or more rows (a short widget shows its two
        // decks rather than one deck and a note), or when there happens to be spare room under the last row.
        int room = heightDp - 94; // the widget's own margins, padding and header
        int fit = Math.max(0, Math.min(5, room / 52)); // none: a short widget is just the title and the total
        boolean spare = room - fit * 52 >= 28;
        int show = count <= fit ? count : (spare || fit < 3) ? fit : fit - 1;
        if (fit == 0) show = 0;
        for (int k = 0; k < show; k++) {
            JSONObject deck = decks.optJSONObject(order[k]);
            int due = deck.optInt("due", 0);
            v.setViewVisibility(ROW[k], View.VISIBLE);
            v.setInt(LINE[k], "setBackgroundColor", p.border);
            v.setTextViewText(NAME[k], deck.optString("title"));
            v.setTextColor(NAME[k], p.foreground);
            v.setTextViewText(COUNT[k], due > 0 ? String.valueOf(due) : "✓");
            v.setTextColor(COUNT[k], due > 0 ? p.foreground : p.muted);
            v.setOnClickPendingIntent(ROW[k], AddCardWidget.open(context, "simplebiblememory://deck/" + deck.optString("id"), 30 + k));
        }
        if (fit > 0 && count > show && (spare || fit >= 3)) {
            v.setViewVisibility(R.id.due_more, View.VISIBLE);
            v.setTextViewText(R.id.due_more, WidgetData.fill(WidgetData.label(context, "more", "+{count} more"), count - show));
        }
        if (total == 0) {
            v.setViewVisibility(R.id.due_empty, View.GONE);
        }
        return v;
    }
}
