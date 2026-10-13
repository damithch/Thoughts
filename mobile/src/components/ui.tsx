import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";

import { formatLongDate, shiftDate } from "@/lib/dates";
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

// Full-screen spinner, or the load error with a retry button.
export function LoadingState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Centered>
      {error ? (
        <>
          <ErrorText message={error} />
          <Button title="Try again" onPress={onRetry} variant="secondary" />
        </>
      ) : (
        <ActivityIndicator color={colors.action} size="large" />
      )}
    </Centered>
  );
}

export function CardTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

// Tabs within a screen (e.g. Upcoming | Inbox | Routines | Review).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Pick a calendar day with ‹ › buttons (dates are YYYY-MM-DD strings, as on the server).
// With `allowNone`, the value can be cleared (e.g. "No date" puts a task in the Inbox).
export function DateStepper({
  label,
  value,
  onChange,
  allowNone,
  noneLabel = "No date",
  fallback,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  // Where to start when stepping from "no date".
  fallback: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(shiftDate(value ?? fallback, -1))}
          hitSlop={10}
          style={styles.stepperButton}
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={20} color={colors.action} />
        </Pressable>
        <Text style={styles.stepperValue}>{value ? formatLongDate(value) : noneLabel}</Text>
        <Pressable
          onPress={() => onChange(shiftDate(value ?? fallback, 1))}
          hitSlop={10}
          style={styles.stepperButton}
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.action} />
        </Pressable>
      </View>
      <View style={styles.stepperShortcuts}>
        <Pressable onPress={() => onChange(fallback)} hitSlop={6}>
          <Text style={styles.link}>Today</Text>
        </Pressable>
        <Pressable onPress={() => onChange(shiftDate(fallback, 1))} hitSlop={6}>
          <Text style={styles.link}>Tomorrow</Text>
        </Pressable>
        {allowNone ? (
          <Pressable onPress={() => onChange(null)} hitSlop={6}>
            <Text style={styles.link}>{noneLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.card}
      />
    </View>
  );
}

// A tappable row that leads to another screen.
export function NavRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navRow, pressed && { opacity: 0.7 }]}>
      <View style={styles.navIcon}>
        <Ionicons name={icon} size={20} color={colors.action} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.hint}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}

// 0..max scale as tappable pills (e.g. activation ratings 0-8, controllability 0-10).
export function ScalePicker({
  label,
  value,
  onChange,
  min = 0,
  max,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  lowLabel?: string;
  highLabel?: string;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, index) => ({
    value: min + index,
    label: String(min + index),
  }));

  return (
    <View>
      <ChoiceRow label={label} options={options} value={value} onChange={onChange} />
      {lowLabel || highLabel ? (
        <View style={styles.moodScale}>
          <Text style={styles.hint}>{lowLabel}</Text>
          <Text style={styles.hint}>{highLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statTile}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

export function Fab({ onPress, label, icon = "add" }: { onPress: () => void; label: string; icon?: React.ComponentProps<typeof Ionicons>["name"] }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={30} color={colors.actionText} />
    </Pressable>
  );
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
  cardTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginTop: 4 },
  muted: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  link: { color: colors.accent, fontSize: 13 },
  segmented: {
    flexDirection: "row",
    backgroundColor: "rgba(2,44,34,0.06)",
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: "center" },
  segmentSelected: { backgroundColor: colors.card, elevation: 1 },
  segmentText: { fontSize: 13, color: colors.inkSoft },
  segmentTextSelected: { color: colors.action, fontWeight: "600" },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperButton: { padding: 12 },
  stepperValue: { flex: 1, textAlign: "center", fontSize: 16, color: colors.ink },
  stepperShortcuts: { flexDirection: "row", gap: 16 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTitle: { fontSize: 15, color: colors.ink },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.field,
    alignItems: "center",
    justifyContent: "center",
  },
  statTile: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.cardSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  statValue: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(2,44,34,0.08)", overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.accent },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
