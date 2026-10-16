import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";

import { colors, fonts } from "@/lib/theme";
import type { CheckIn, TodayResponse } from "@/lib/types";

// "Inner weather": a small sky that is your day.
// - The sun climbs from dawn to midday as tasks get done.
// - The latest check-in sets the weather (mood) and the wind (energy).
// - Writing the day's anchor note lights the lighthouse.
// - Worries postponed today sit as little clouds in the "later" corner.

const HEIGHT = 180;

type Weather = "clear" | "fair" | "cloudy" | "rain" | "unknown";

function weatherFor(checkIn: CheckIn | null): Weather {
  if (!checkIn) return "unknown";
  if (checkIn.mood >= 8) return "clear";
  if (checkIn.mood >= 6) return "fair";
  if (checkIn.mood >= 4) return "cloudy";
  return "rain";
}

// Seconds for a cloud to cross the sky.
const WIND_SECONDS = { low: 46, steady: 28, high: 14 } as const;

const WEATHER_TEXT: Record<Weather, string> = {
  clear: "Clear skies",
  fair: "A few clouds",
  cloudy: "Overcast",
  rain: "Rain",
  unknown: "Check in to set the weather",
};

function timeOfDay(done: number, total: number) {
  if (total === 0) return "Dawn — the sun's waiting for your first task";
  const progress = done / total;
  if (progress === 0) return "Dawn";
  if (progress < 0.34) return "Morning light";
  if (progress < 0.67) return "Sun climbing";
  if (progress < 1) return "Almost midday";
  return "Full midday — everything's done";
}

function mix(a: string, b: string, t: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [from, to] = [parse(a), parse(b)];
  const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * t);

  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

// Dawn peach -> warm morning cream -> clear midday blue (going straight from peach to blue
// would pass through grey). Bad weather pulls it toward overcast grey.
const SKY_STOPS: [number, string][] = [
  [0, "#FAD3BE"],
  [0.35, "#FBE7C6"],
  [0.7, "#CDEAF3"],
  [1, "#AEDDF5"],
];

function hex(value: string) {
  const channels = value.match(/\d+/g)!.map(Number);
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function skyColor(progress: number, weather: Weather) {
  const upper = SKY_STOPS.findIndex(([stop]) => stop >= progress);
  const [toStop, toColor] = SKY_STOPS[Math.max(upper, 1)];
  const [fromStop, fromColor] = SKY_STOPS[Math.max(upper, 1) - 1];
  const clear = hex(mix(fromColor, toColor, (progress - fromStop) / (toStop - fromStop)));

  if (weather === "rain") return mix("#AEB9C4", clear, 0.2);
  if (weather === "cloudy") return mix("#CFD8DF", clear, 0.45);

  return clear;
}

// A puffy cloud drawn in its own little canvas.
function CloudShape({ width, color }: { width: number; color: string }) {
  const height = width * 0.5;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 50">
      <Path d="M14 44 C2 44 2 28 14 27 C14 14 32 10 38 20 C44 6 70 6 72 22 C86 18 98 30 90 44 Z" fill={color} />
    </Svg>
  );
}

function DriftingCloud({
  width,
  sceneWidth,
  top,
  seconds,
  startAt,
  color,
  still,
}: {
  width: number;
  sceneWidth: number;
  top: number;
  seconds: number;
  startAt: number;
  color: string;
  still: boolean;
}) {
  const x = useRef(new Animated.Value(-width + (sceneWidth + width) * startAt)).current;

  useEffect(() => {
    if (still || sceneWidth === 0) {
      x.setValue(-width + (sceneWidth + width) * startAt);
      return;
    }

    let stopped = false;
    const from = -width;
    const to = sceneWidth;

    // First pass from the cloud's current spot, then full passes forever.
    const run = (start: number) => {
      x.setValue(start);
      Animated.timing(x, {
        toValue: to,
        duration: ((to - start) / (to - from)) * seconds * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !stopped) run(from);
      });
    };

    run(-width + (sceneWidth + width) * startAt);

    return () => {
      stopped = true;
      x.stopAnimation();
    };
  }, [x, width, sceneWidth, seconds, startAt, still]);

  return (
    <Animated.View style={[styles.layer, { top, width, transform: [{ translateX: x }] }]} pointerEvents="none">
      <CloudShape width={width} color={color} />
    </Animated.View>
  );
}

function Rain({ width, slant, still }: { width: number; slant: number; still: boolean }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(y, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [y, still]);

  const drops = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < Math.ceil(width / 22); col += 1) {
        list.push({ x: col * 22 + ((row * 9) % 22), y: row * 22 + ((col * 7) % 11) });
      }
    }
    return list;
  }, [width]);

  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [-176, 0] });

  return (
    <View style={[styles.layer, { top: 30, height: HEIGHT - 70, width, overflow: "hidden" }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY }, { rotate: `${slant}deg` }] }}>
        {[0, 176].map((offset) => (
          <Svg key={offset} width={width} height={176}>
            {drops.map((drop, index) => (
              <Path key={index} d={`M${drop.x} ${drop.y} l-2 8`} stroke="#5B7A94" strokeWidth={1.6} strokeLinecap="round" />
            ))}
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
}

function Sun({ width, progress, dim }: { width: number; progress: number; dim: boolean }) {
  const value = useRef(new Animated.Value(progress)).current;

  // Glide to the new height when tasks are finished.
  useEffect(() => {
    Animated.spring(value, { toValue: progress, useNativeDriver: true, friction: 9, tension: 30 }).start();
  }, [value, progress]);

  const size = 38;
  const translateX = value.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0.1, 0.2, 0.3, 0.4, 0.5].map((fraction) => fraction * width - size / 2),
  });
  const translateY = value.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0.78, 0.47, 0.3, 0.2, 0.14].map((fraction) => fraction * HEIGHT - size / 2),
  });

  return (
    <Animated.View style={[styles.layer, { opacity: dim ? 0.55 : 1, transform: [{ translateX }, { translateY }] }]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx={20} cy={20} r={19} fill="#FDE68A" opacity={0.55} />
        <Circle cx={20} cy={20} r={13} fill="#FBBF24" />
      </Svg>
    </Animated.View>
  );
}

// Pulsing glow around the lighthouse lamp once the anchor is down.
function LampGlow({ x, y, still }: { x: number; y: number; still: boolean }) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  return (
    <Animated.View style={[styles.layer, { left: x - 14, top: y - 14, opacity: pulse }]} pointerEvents="none">
      <Svg width={28} height={28}>
        <Circle cx={14} cy={14} r={13} fill="#FEF3C7" />
        <Circle cx={14} cy={14} r={7} fill="#FDE68A" />
      </Svg>
    </Animated.View>
  );
}

function Ground({ width, lit, laterCount }: { width: number; lit: boolean; laterCount: number }) {
  const w = width;
  const h = HEIGHT;
  const lhX = w * 0.86;
  const base = h * 0.84;
  const top = h * 0.5;

  return (
    <Svg width={w} height={h} style={styles.layer} pointerEvents="none">
      {/* Hills on the left, running down into the sea; the curved shoreline hides their ends. */}
      <Path
        d={`M0 ${h * 0.78} Q${w * 0.2} ${h * 0.6} ${w * 0.42} ${h * 0.75} T${w * 0.74} ${h * 0.8} L${w * 0.74} ${h} L0 ${h} Z`}
        fill="#8CBF8F"
      />
      <Path
        d={`M0 ${h * 0.88} Q${w * 0.18} ${h * 0.76} ${w * 0.36} ${h * 0.86} T${w * 0.64} ${h * 0.9} L${w * 0.64} ${h} L0 ${h} Z`}
        fill="#5E9A6B"
      />
      <Path
        d={`M${w * 0.62} ${h * 0.77} L${w} ${h * 0.77} L${w} ${h} L${w * 0.5} ${h} Q${w * 0.57} ${h * 0.84} ${w * 0.62} ${h * 0.77} Z`}
        fill="#6FA8C2"
      />
      <Path d={`M${w * 0.66} ${h * 0.83} q12 -3 24 0 t24 0 t24 0`} stroke="#A9D2E3" strokeWidth={1.5} fill="none" />

      {/* Lighthouse on its rock. */}
      <Ellipse cx={lhX} cy={base + 4} rx={26} ry={9} fill="#7A8794" />
      {lit ? (
        <Polygon points={`${lhX},${top + 6} ${lhX - w * 0.42},${top - 18} ${lhX - w * 0.42},${top + 26}`} fill="#FEF3C7" opacity={0.55} />
      ) : null}
      <Polygon points={`${lhX - 8},${base} ${lhX + 8},${base} ${lhX + 5},${top + 12} ${lhX - 5},${top + 12}`} fill="#F8FAFC" />
      <Polygon points={`${lhX - 7.2},${base - 12} ${lhX + 7.2},${base - 12} ${lhX + 6.5},${base - 22} ${lhX - 6.5},${base - 22}`} fill="#E11D48" />
      <Polygon points={`${lhX - 6},${top + 34} ${lhX + 6},${top + 34} ${lhX + 5.5},${top + 25} ${lhX - 5.5},${top + 25}`} fill="#E11D48" />
      <Rect x={lhX - 7} y={top + 2} width={14} height={10} rx={2} fill={lit ? "#FDE68A" : "#475569"} />
      <Polygon points={`${lhX - 9},${top + 2} ${lhX + 9},${top + 2} ${lhX},${top - 8}`} fill="#E11D48" />

      {/* "Later" corner for postponed worries. */}
      {laterCount > 0 ? (
        <G>
          <Rect x={w - 86} y={10} width={74} height={40} rx={10} fill="#FFFFFF" opacity={0.75} stroke="#94A3B8" strokeDasharray="3 3" />
          <SvgText x={w - 49} y={45} fontSize={10} fill="#64748B" textAnchor="middle">
            later
          </SvgText>
          {Array.from({ length: Math.min(laterCount, 4) }, (_, index) => (
            <Path
              key={index}
              transform={`translate(${w - 80 + index * 15} ${index % 2 === 0 ? 16 : 20}) scale(0.16)`}
              d="M14 44 C2 44 2 28 14 27 C14 14 32 10 38 20 C44 6 70 6 72 22 C86 18 98 30 90 44 Z"
              fill="#94A3B8"
            />
          ))}
        </G>
      ) : null}
    </Svg>
  );
}

export function InnerWeather({ data }: { data: TodayResponse }) {
  const [width, setWidth] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => setStill(false));
  }, []);

  const counted = data.tasks.filter((task) => task.status !== "skipped");
  const done = counted.filter((task) => task.status === "done").length;
  const progress = counted.length === 0 ? 0 : done / counted.length;
  const latest = data.checkIns.reduce<CheckIn | null>(
    (newest, checkIn) => (!newest || checkIn.created_at > newest.created_at ? checkIn : newest),
    null,
  );
  const weather = weatherFor(latest);
  const seconds = WIND_SECONDS[latest?.energy ?? "steady"];
  const lit = Boolean(data.anchorNote);
  const laterCount = data.worry.module ? data.worry.postponed_items.length : 0;

  const clouds = useMemo(() => {
    const white = "#FFFFFF";
    const grey = "#E2E8F0";
    const dark = "#94A3B8";
    switch (weather) {
      case "clear":
        return [];
      case "fair":
        return [
          { width: 70, top: 26, startAt: 0.15, color: white },
          { width: 52, top: 58, startAt: 0.65, color: white },
        ];
      case "cloudy":
        return [
          { width: 110, top: 14, startAt: 0.1, color: grey },
          { width: 90, top: 44, startAt: 0.55, color: white },
          { width: 70, top: 72, startAt: 0.85, color: grey },
        ];
      case "rain":
        return [
          { width: 130, top: 6, startAt: 0.05, color: dark },
          { width: 110, top: 30, startAt: 0.45, color: "#A3B1C2" },
          { width: 100, top: 12, startAt: 0.8, color: dark },
        ];
      default:
        return [
          { width: 64, top: 30, startAt: 0.3, color: "rgba(255,255,255,0.7)" },
          { width: 48, top: 66, startAt: 0.75, color: "rgba(255,255,255,0.7)" },
        ];
    }
  }, [weather]);

  const details = [
    WEATHER_TEXT[weather],
    lit ? "Lighthouse lit" : null,
    laterCount > 0 ? `${laterCount} ${laterCount === 1 ? "worry" : "worries"} parked for later` : null,
  ].filter(Boolean);

  const summary = `${timeOfDay(done, counted.length)}. ${details.join(". ")}.`;

  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          "Your inner weather",
          [
            "☀️ The sun climbs from dawn to midday as you finish the day's tasks.",
            "☁️ Your latest check-in sets the weather: high mood clears the sky, low mood brings cloud and rain. Energy sets the wind.",
            "🗼 Write the day's anchor note to light the lighthouse.",
            "🌥️ Worries you postpone wait in the “later” corner.",
          ].join("\n\n"),
        )
      }
      accessibilityRole="button"
      accessibilityLabel={`Inner weather. ${summary}`}
      accessibilityHint="Explains how the sky works"
    >
      <View style={styles.card}>
        <View
          style={[styles.scene, { backgroundColor: skyColor(progress, weather) }]}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {width > 0 ? (
            <>
              <Sun width={width} progress={progress} dim={weather === "rain" || weather === "cloudy"} />
              {clouds.map((cloud, index) => (
                <DriftingCloud key={`${weather}-${index}`} {...cloud} sceneWidth={width} seconds={seconds} still={still} />
              ))}
              {weather === "rain" ? <Rain width={width} slant={latest?.energy === "high" ? 12 : latest?.energy === "low" ? 0 : 6} still={still} /> : null}
              <Ground width={width} lit={lit} laterCount={laterCount} />
              {lit ? <LampGlow x={width * 0.86} y={HEIGHT * 0.5 + 7} still={still} /> : null}
            </>
          ) : null}
        </View>
        <View style={styles.caption}>
          <Text style={styles.title}>{timeOfDay(done, counted.length)}</Text>
          <Text style={styles.details}>
            {counted.length > 0 ? `${done} of ${counted.length} done · ` : ""}
            {details.join(" · ")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  scene: { height: HEIGHT, overflow: "hidden" },
  layer: { position: "absolute", left: 0, top: 0 },
  caption: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  details: { fontSize: 13, color: colors.inkSoft },
});
