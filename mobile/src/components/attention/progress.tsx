import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { Muted } from "@/components/ui";
import { ATTENTION_COPY, type AttentionDay, type AttentionStats } from "@/lib/attention";
import { colors } from "@/lib/theme";

const TASK_COLOR = colors.accent;
const MEDITATION_COLOR = "#0E7490";
const BEFORE_COLOR = "#A8A29E";

function weekdayLetter(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" });
}

function Dot({ filled, color }: { filled: boolean; color: string }) {
  return <View style={[styles.dot, filled ? { backgroundColor: color, borderColor: color } : { borderColor: colors.border }]} />;
}

// Seven days, two dots each: a mundane task session and a meditation. Empty days stay neutral.
export function WeekStrip({ days, today }: { days: AttentionDay[]; today: string }) {
  return (
    <View>
      <View style={styles.week}>
        {days.map((day) => {
          const label = `${day.date}: ${day.mundane} task session${day.mundane === 1 ? "" : "s"}, ${day.meditation} meditation${day.meditation === 1 ? "" : "s"}`;

          return (
            <View key={day.date} style={styles.day} accessible accessibilityLabel={label}>
              <Text style={[styles.dayLetter, day.date === today && styles.today]}>{weekdayLetter(day.date)}</Text>
              <Dot filled={day.mundane > 0} color={TASK_COLOR} />
              <Dot filled={day.meditation > 0} color={MEDITATION_COLOR} />
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Dot filled color={TASK_COLOR} />
          <Text style={styles.legendText}>Task focusing</Text>
        </View>
        <View style={styles.legendItem}>
          <Dot filled color={MEDITATION_COLOR} />
          <Text style={styles.legendText}>Meditation</Text>
        </View>
      </View>
    </View>
  );
}

const HEIGHT = 160;
const PAD = { left: 30, right: 10, top: 10, bottom: 18 };

// Task focus before (grey) and after (green) for each mundane session in the last 30 days.
export function TrendChart({ trend }: { trend: AttentionStats["trend"] }) {
  const [width, setWidth] = useState(0);

  if (trend.length === 0) {
    return <Muted>{ATTENTION_COPY.emptyTrend}</Muted>;
  }

  const plotWidth = Math.max(1, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (trend.length === 1 ? plotWidth / 2 : (index / (trend.length - 1)) * plotWidth);
  const y = (value: number) => PAD.top + (1 - value / 100) * plotHeight;
  const points = (key: "before" | "after") => trend.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT} accessibilityLabel="Task focus before and after each session">
          {[0, 50, 100].map((value) => (
            <SvgText key={value} x={PAD.left - 6} y={y(value) + 4} fontSize={10} fill={colors.inkFaint} textAnchor="end">
              {`${value}%`}
            </SvgText>
          ))}
          {[0, 50, 100].map((value) => (
            <Line key={`grid-${value}`} x1={PAD.left} x2={width - PAD.right} y1={y(value)} y2={y(value)} stroke={colors.border} strokeWidth={1} />
          ))}
          <Polyline points={points("before")} fill="none" stroke={BEFORE_COLOR} strokeWidth={2} strokeDasharray="4 4" />
          <Polyline points={points("after")} fill="none" stroke={TASK_COLOR} strokeWidth={2.5} />
          {trend.map((point, index) => (
            <Circle key={`b-${index}`} cx={x(index)} cy={y(point.before)} r={3} fill={BEFORE_COLOR} />
          ))}
          {trend.map((point, index) => (
            <Circle key={`a-${index}`} cx={x(index)} cy={y(point.after)} r={3.5} fill={TASK_COLOR} />
          ))}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: BEFORE_COLOR }]} />
          <Text style={styles.legendText}>Before</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: TASK_COLOR }]} />
          <Text style={styles.legendText}>After (% on the task)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: "row", justifyContent: "space-between" },
  day: { alignItems: "center", gap: 6, flex: 1 },
  dayLetter: { fontSize: 12, color: colors.inkSoft },
  today: { color: colors.action, fontWeight: "700" },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, backgroundColor: "transparent" },
  legend: { flexDirection: "row", gap: 16, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 12, color: colors.inkSoft },
  swatch: { width: 14, height: 3, borderRadius: 2 },
});
