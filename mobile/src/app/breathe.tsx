import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, ChoiceRow, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { BREATHING_MINUTES, BREATHING_PATTERNS, cyclesFor } from "@/lib/support";
import { colors, fonts } from "@/lib/theme";
import { errorMessage } from "@/lib/use-api";

const RESTING = 0.55;
const KEEP_AWAKE_TAG = "breathing";

type Run = { patternIndex: number; cycles: number; startedAt: number };

// Guided breathing: follow the circle; a light tap marks each change so eyes can stay closed.
// A minute or more ticks off today's breathing habit.
export default function BreatheScreen() {
  const params = useLocalSearchParams<{ minutes?: string }>();
  const { request } = useAuth();
  const [patternIndex, setPatternIndex] = useState(0);
  const [minutes, setMinutes] = useState(() => {
    const requested = Number(params.minutes);
    return BREATHING_MINUTES.includes(requested) ? requested : 2;
  });
  const [run, setRun] = useState<Run | null>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseEndsAt, setPhaseEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(RESTING)).current;
  const runRef = useRef<Run | null>(null);

  const pattern = BREATHING_PATTERNS[run ? run.patternIndex : patternIndex];
  const phase = run ? pattern.phases[phaseIndex] : null;

  useEffect(() => {
    if (!run) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [run]);

  // Stop everything if the screen is left mid-session.
  useEffect(
    () => () => {
      runRef.current = null;
      scale.stopAnimation();
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    },
    [scale],
  );

  function runPhase(current: Run, index: number, cycle: number) {
    const phases = BREATHING_PATTERNS[current.patternIndex].phases;
    const next = phases[index];

    setPhaseIndex(index);
    setPhaseEndsAt(Date.now() + next.seconds * 1000);

    if (next.label === "Breathe in") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else if (next.label === "Breathe out") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    else Haptics.selectionAsync().catch(() => {});

    Animated.timing(scale, {
      toValue: next.expanded ? 1 : RESTING,
      duration: next.seconds * 1000,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || runRef.current !== current) return;

      const nextIndex = (index + 1) % phases.length;
      const nextCycle = nextIndex === 0 ? cycle + 1 : cycle;

      if (nextCycle >= current.cycles) {
        finish(current, true);
      } else {
        runPhase(current, nextIndex, nextCycle);
      }
    });
  }

  function start() {
    const current: Run = { patternIndex, cycles: cyclesFor(BREATHING_PATTERNS[patternIndex].phases, minutes), startedAt: Date.now() };
    runRef.current = current;
    setResult(null);
    setRun(current);
    setNow(Date.now());
    scale.setValue(RESTING);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    runPhase(current, 0, 0);
  }

  async function finish(current: Run, completed: boolean) {
    runRef.current = null;
    scale.stopAnimation();
    Animated.timing(scale, { toValue: RESTING, duration: 600, useNativeDriver: true }).start();
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    setRun(null);

    const seconds = Math.round((Date.now() - current.startedAt) / 1000);

    if (seconds < 20) {
      setResult("Stopped. Come back whenever you need it.");
      return;
    }

    if (completed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const minutesDone = Math.max(1, Math.round(seconds / 60));
    const lead = completed
      ? `Well done: about ${minutesDone} minute${minutesDone === 1 ? "" : "s"} of slow breathing.`
      : `${seconds} seconds of slow breathing.`;

    try {
      const logged = await request<{ completedTask: string | null }>("/v1/support/breathing", {
        method: "POST",
        body: { seconds },
      });
      setResult(logged.completedTask ? `${lead} Marked “${logged.completedTask}” as done.` : lead);
    } catch (caught) {
      setResult(`${lead} (Couldn't save it: ${errorMessage(caught)})`);
    }
  }

  const totalSeconds = run ? run.cycles * pattern.phases.reduce((total, item) => total + item.seconds, 0) : 0;
  const elapsed = run ? Math.min(totalSeconds, (now - run.startedAt) / 1000) : 0;
  const left = Math.max(0, Math.ceil(totalSeconds - elapsed));
  const secondsInPhase = phase ? Math.max(1, Math.ceil((phaseEndsAt - now) / 1000)) : 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.stage} accessibilityLiveRegion="polite">
        <Animated.View style={[styles.outer, { transform: [{ scale }] }]} />
        <Animated.View style={[styles.inner, { transform: [{ scale }] }]} />
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.count}>{phase ? secondsInPhase : minutes}</Text>
          {!phase ? <Text style={styles.unit}>min</Text> : null}
        </View>
      </View>
      <Text style={styles.phase}>{phase ? phase.label : "Ready when you are"}</Text>

      {run ? (
        <View style={{ gap: 12 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(elapsed / Math.max(totalSeconds, 1)) * 100}%` }]} />
          </View>
          <Text style={styles.left}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
          </Text>
          <Button title="Stop" variant="secondary" onPress={() => run && finish(run, false)} />
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <ChoiceRow
            label="Pattern"
            options={BREATHING_PATTERNS.map((item, index) => ({ value: index, label: `${item.name} · ${item.description}` }))}
            value={patternIndex}
            onChange={setPatternIndex}
          />
          <ChoiceRow
            label="Length"
            options={BREATHING_MINUTES.map((value) => ({ value, label: `${value} min` }))}
            value={minutes}
            onChange={setMinutes}
          />
          <Button title="Start" onPress={start} />
          {result ? <Text style={styles.result}>{result}</Text> : null}
          <Muted>Breathe through your nose if you can, and let the out-breath be slow. A minute or more ticks off today&apos;s breathing habit.</Muted>
        </View>
      )}
    </ScrollView>
  );
}

const SIZE = 260;

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24, paddingBottom: 48 },
  stage: { width: SIZE, height: SIZE, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 8 },
  outer: { position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: "#CDEBD5" },
  inner: { position: "absolute", width: SIZE - 52, height: SIZE - 52, borderRadius: (SIZE - 52) / 2, backgroundColor: "#2F7A55" },
  center: { alignItems: "center" },
  phase: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, textAlign: "center", marginTop: -8 },
  count: { fontSize: 34, fontWeight: "600", color: "#F0FDF4" },
  unit: { fontSize: 13, color: "#D1FAE5" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(2,44,34,0.08)", overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.accent },
  left: { textAlign: "center", color: colors.inkSoft, fontSize: 13 },
  result: { textAlign: "center", color: colors.action, fontSize: 15, lineHeight: 22 },
});
