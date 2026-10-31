import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Eyebrow } from "@/components/ui";
import {
  ANCHOR_PROMPTS,
  ATTENTION_ANCHORS,
  ATTENTION_COPY,
  splitAttention,
  type AttentionAnchor,
  type AttentionIdea,
} from "@/lib/attention";
import { colors, radius } from "@/lib/theme";

const STEP = 5;

// One slider: how much attention is on me/my thoughts; the task side is shown as the rest.
// Starts unrated (null) so an untouched slider never saves a made-up 50%.
// The finger position is read as a screen coordinate (pageX) against where the track started,
// which stays correct while dragging (locationX jumps around on Android). `onDragChange` lets the
// screen pause scrolling during a drag so the scroll view can't steal the gesture.
export function FocusSlider({
  label,
  value,
  onChange,
  onDragChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const trackLeft = useRef(0);
  const split = value === null ? null : splitAttention(value);

  function setFromX(x: number) {
    if (width <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / width));
    const next = Math.round((ratio * 100) / STEP) * STEP;
    if (next !== value) onChange(next);
  }

  function nudge(delta: number) {
    onChange(Math.min(100, Math.max(0, (value ?? 50) + delta)));
  }

  function end() {
    onDragChange?.(false);
  }

  return (
    <View style={styles.wrap}>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.ends}>
        <Text style={styles.endText}>Me / my thoughts</Text>
        <Text style={styles.endText}>The task</Text>
      </View>
      <View style={styles.sliderRow}>
        <Pressable
          onPress={() => nudge(-STEP)}
          hitSlop={8}
          style={styles.nudge}
          accessibilityLabel="Less attention on me (5%)"
        >
          <Ionicons name="remove" size={18} color={colors.action} />
        </Pressable>
        <View
          style={styles.track}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(event) => {
            // At touch-down the touch is on the track itself, so locationX is reliable here.
            trackLeft.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
            onDragChange?.(true);
            setFromX(event.nativeEvent.locationX);
          }}
          onResponderMove={(event) => setFromX(event.nativeEvent.pageX - trackLeft.current)}
          onResponderRelease={end}
          onResponderTerminate={end}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}. Percent of attention on yourself and your thoughts.`}
          accessibilityValue={{ min: 0, max: 100, now: value ?? undefined, text: split ? `${split.self}% on me, ${split.task}% on the task` : "Not rated yet" }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === "increment" ? STEP : -STEP)}
        >
          {/* A balance bar: the grey part (left of the thumb) is attention on me, the green part is the task. */}
          <View pointerEvents="none" style={[styles.selfFill, { width: `${split ? split.self : 0}%` }]} />
          <View pointerEvents="none" style={[styles.taskFill, { width: `${split ? split.task : 0}%` }]} />
          {split ? <View pointerEvents="none" style={[styles.thumb, { left: `${split.self}%` }]} /> : null}
        </View>
        <Pressable
          onPress={() => nudge(STEP)}
          hitSlop={8}
          style={styles.nudge}
          accessibilityLabel="More attention on me (5%)"
        >
          <Ionicons name="add" size={18} color={colors.action} />
        </Pressable>
      </View>
      <View style={styles.readout}>
        {split ? (
          <Text style={styles.readoutText}>
            <Text style={styles.readoutStrong}>{split.self}%</Text> {ATTENTION_COPY.selfLabel} ·{" "}
            <Text style={styles.readoutStrong}>{split.task}%</Text> {ATTENTION_COPY.taskLabel}
          </Text>
        ) : (
          <Text style={styles.hint}>Tap or drag to rate</Text>
        )}
        {split ? (
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={styles.link}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AnchorPicker({
  value,
  onChange,
}: {
  value: AttentionAnchor[];
  onChange: (value: AttentionAnchor[]) => void;
}) {
  function toggle(anchor: AttentionAnchor) {
    onChange(value.includes(anchor) ? value.filter((item) => item !== anchor) : [...value, anchor]);
  }

  return (
    <View style={styles.wrap}>
      <Eyebrow>{ATTENTION_COPY.anchorsTitle}</Eyebrow>
      <Text style={styles.hint}>{ATTENTION_COPY.anchorsHint}</Text>
      <View style={styles.anchorGrid}>
        {ATTENTION_ANCHORS.map((anchor) => {
          const selected = value.includes(anchor);

          return (
            <Pressable
              key={anchor}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggle(anchor)}
              style={[styles.anchor, selected && styles.anchorSelected]}
            >
              <Text style={[styles.anchorLabel, selected && styles.anchorLabelSelected]}>
                {selected ? "✓ " : ""}
                {ANCHOR_PROMPTS[anchor].label}
              </Text>
              <Text style={[styles.anchorPrompt, selected && styles.anchorPromptSelected]}>{ANCHOR_PROMPTS[anchor].prompt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MinutesStepper({
  label = "Minutes",
  value,
  onChange,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const set = (next: number) => onChange(Math.min(120, Math.max(1, next)));

  return (
    <View style={styles.wrap}>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.stepper}>
        <Pressable onPress={() => set(value - 1)} hitSlop={10} style={styles.stepperButton} accessibilityLabel="One minute less">
          <Ionicons name="remove" size={20} color={colors.action} />
        </Pressable>
        <Text style={styles.stepperValue} accessibilityLiveRegion="polite">
          {value} min
        </Text>
        <Pressable onPress={() => set(value + 1)} hitSlop={10} style={styles.stepperButton} accessibilityLabel="One minute more">
          <Ionicons name="add" size={20} color={colors.action} />
        </Pressable>
      </View>
      <View style={styles.quick}>
        {[2, 5, 10, 15, 20].map((minutes) => (
          <Pressable key={minutes} onPress={() => set(minutes)} hitSlop={6}>
            <Text style={[styles.link, minutes === value && { fontWeight: "700" }]}>{minutes}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Saved everyday tasks as chips, plus a box to type a new one.
export function TaskPicker({
  ideas,
  value,
  onChange,
}: {
  ideas: AttentionIdea[];
  value: string;
  onChange: (value: string) => void;
}) {
  const typed = !ideas.some((idea) => idea.name === value);

  return (
    <View style={styles.wrap}>
      <Eyebrow>Everyday task</Eyebrow>
      {ideas.length > 0 ? (
        <View style={styles.chips}>
          {ideas.map((idea) => {
            const selected = idea.name === value;

            return (
              <Pressable
                key={idea.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChange(idea.name)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{idea.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <TextInput
        value={typed ? value : ""}
        onChangeText={onChange}
        placeholder={ideas.length > 0 ? "Or type a new one" : "e.g. Walking, brushing teeth, washing dishes"}
        placeholderTextColor={colors.inkFaint}
        maxLength={120}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.inkSoft },
  link: { fontSize: 13, color: colors.accent },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  endText: { fontSize: 11, color: colors.inkSoft },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nudge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  track: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    overflow: "visible",
    justifyContent: "flex-start",
  },
  selfFill: { height: "100%", backgroundColor: "#E7E5E4", borderTopLeftRadius: radius.pill, borderBottomLeftRadius: radius.pill },
  taskFill: { height: "100%", backgroundColor: "#A7DDB8", borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  thumb: {
    position: "absolute",
    top: -3,
    width: 28,
    height: 40,
    marginLeft: -14,
    borderRadius: 14,
    backgroundColor: colors.action,
    borderWidth: 3,
    borderColor: colors.card,
  },
  readout: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  readoutText: { fontSize: 14, color: colors.ink },
  readoutStrong: { fontWeight: "700" },
  anchorGrid: { gap: 8 },
  anchor: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  anchorSelected: { backgroundColor: colors.action, borderColor: colors.action },
  anchorLabel: { fontSize: 15, fontWeight: "600", color: colors.ink },
  anchorLabelSelected: { color: colors.actionText },
  anchorPrompt: { fontSize: 12, color: colors.inkSoft },
  anchorPromptSelected: { color: "#A7F3D0" },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepperButton: { padding: 10 },
  stepperValue: { fontSize: 16, color: colors.ink },
  quick: { flexDirection: "row", gap: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.action, borderColor: colors.action },
  chipText: { fontSize: 14, color: colors.ink },
  chipTextSelected: { color: colors.actionText },
  input: {
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
});
