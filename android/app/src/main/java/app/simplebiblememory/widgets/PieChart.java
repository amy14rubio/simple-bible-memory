package app.simplebiblememory.widgets;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;

/** The Statistics widget's pie: card counts by stage, in the app's own slice colours (see StatisticsPage.tsx). */
final class PieChart {
    private PieChart() {}

    static Bitmap draw(int size, int[] counts, int[] colors, int emptyColor, int gapColor) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        RectF box = new RectF(size * 0.02f, size * 0.02f, size * 0.98f, size * 0.98f);
        int total = 0;
        for (int c : counts) total += c;
        if (total == 0) {
            paint.setColor(emptyColor);
            canvas.drawOval(box, paint);
            return bitmap;
        }
        float start = -90f;
        for (int i = 0; i < counts.length; i++) {
            if (counts[i] == 0) continue;
            float sweep = 360f * counts[i] / total;
            paint.setColor(colors[i]);
            canvas.drawArc(box, start, sweep, true, paint);
            start += sweep;
        }
        // thin separators between the slices, like the chart in the app (none when one slice is the whole pie)
        int slices = 0;
        for (int c : counts) if (c > 0) slices++;
        if (slices < 2) return bitmap;
        paint.setColor(gapColor);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(size * 0.012f);
        start = -90f;
        for (int i = 0; i < counts.length; i++) {
            if (counts[i] == 0) continue;
            float sweep = 360f * counts[i] / total;
            double a = Math.toRadians(start);
            canvas.drawLine(size / 2f, size / 2f, size / 2f + (float) Math.cos(a) * size * 0.49f, size / 2f + (float) Math.sin(a) * size * 0.49f, paint);
            start += sweep;
        }
        return bitmap;
    }
}
