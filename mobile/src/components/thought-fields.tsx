import { Pressable, StyleSheet, Text, View } from "react-native";

import { Eyebrow, Field, Muted } from "@/components/ui";
import { colors, radius } from "@/lib/theme";
import { EMOTIONS, LIFE_AREAS, MAX_EMOTIONS, MAX_TRIGGER_LENGTH, toggleEmotion } from "@/lib/thought-fields";

// Emotions (up to three), one life area and an optional trigger: what used to be the single
// free-text "category" box.
export function ThoughtFieldsPicker({
  emotions,
  lifeArea,
  trigger,
  onEmotions,
  onLifeArea,
  onTrigger,
}: {
  emotions: string[];
  lifeArea: string;
  trigger: string;
  onEmotions: (value: string[]) => void;
  onLifeArea: (value: string) => void;
  onTrigger: (value: string) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Eyebrow>How it feels</Eyebrow>
        <View style={styles.wrap}>
          {EMOTIONS.map((emotion) => (
            <Chip
              key={emotion}
              label={emotion}
              selected={emotions.includes(emotion)}
              role="checkbox"
              onPress={() => onEmotions(toggleEmotion(emotions, emotion))}
            />
          ))}
        </View>
        <Muted>Pick up to {MAX_EMOTIONS}.</Muted>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>Life area</Eyebrow>
        <View style={styles.wrap}>
          {LIFE_AREAS.map((area) => (
            <Chip
              key={area.key}
              label={area.label}
              selected={lifeArea === area.key}
              role="radio"
              onPress={() => onLifeArea(lifeArea === area.key ? "" : area.key)}
            />
          ))}
        </View>
      </View>

      <Field
        label="Trigger"
        value={trigger}
        onChangeText={(value) => onTrigger(value.slice(0, MAX_TRIGGER_LENGTH))}
        placeholder="Person, place or event (optional)"
      />
    </View>
  );
}

function Chip({
  label,
  selected,
  role,
  onPress,
}: {
  label: string;
  selected: boolean;
  role: "checkbox" | "radio";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === "checkbox" ? { checked: selected } : { selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  chipSelected: { borderColor: colors.action, backgroundColor: colors.action },
  chipText: { fontSize: 14, color: colors.ink, textTransform: "capitalize" },
  chipTextSelected: { color: colors.actionText, fontWeight: "600" },
});
