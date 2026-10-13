import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";

import { colors, fonts, radius } from "@/lib/theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...inputProps}
        style={[styles.input, inputProps.multiline && styles.multiline, inputProps.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, busy, disabled, variant = "primary", style }: ButtonProps) {
  const inactive = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        (pressed || inactive) && { opacity: 0.6 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" ? colors.actionText : colors.action} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === "secondary" && { color: colors.action },
            variant === "danger" && { color: colors.danger },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// A row of selectable pills, used for mood, priority, energy and focus.
export function ChoiceRow<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const MOOD_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));

export function MoodPicker({
  value,
  onChange,
  label = "Mood",
}: {
  value: number | null;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <View>
      <ChoiceRow label={label} options={MOOD_OPTIONS} value={value} onChange={onChange} />
      <View style={styles.moodScale}>
        <Text style={styles.hint}>1 = low</Text>
        <Text style={styles.hint}>10 = high</Text>
      </View>
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{children}</Text>
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
    shadowColor: "#305435",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.label,
  },
  heading: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
  },
  fieldWrap: { gap: 8 },
  input: {
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  hint: { fontSize: 12, color: colors.inkFaint },
  button: {
    backgroundColor: colors.action,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
  },
  buttonText: {
    color: colors.actionText,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    alignItems: "center",
  },
  choiceSelected: { backgroundColor: colors.action, borderColor: colors.action },
  choiceText: { fontSize: 14, color: colors.ink },
  choiceTextSelected: { color: colors.actionText, fontWeight: "600" },
  moodScale: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
  },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.action },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
});
